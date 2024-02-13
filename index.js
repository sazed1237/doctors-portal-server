const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, Admin, MongoAWSError, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cjqbcg8.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// jwt verifying 
const verifyJWT = (req, res, next) => {
    // console.log('tumi keda')
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' })
    }

    const token = authHeader.split(' ')[1]
    // console.log('token form jwt verify', token)

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET,
        function (err, decoded) {
            if (err) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            // console.log(decoded)
            req.decoded = decoded
            next()
        });
}




async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const servicesCollections = client.db("doctors_portal").collection("service");
        const bookingsCollections = client.db("doctors_portal").collection("booking");
        const usersCollections = client.db("doctors_portal").collection("users");
        const doctorsCollections = client.db("doctors_portal").collection("doctors");


        // middleware check admin role
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await usersCollections.findOne({ email: requester });

            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }
        }



        // User route
        app.get('/users', verifyJWT, async (req, res) => {
            const users = await usersCollections.find().toArray()
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollections.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updatedUser = {
                $set: { role: 'admin' }
            }
            const result = await usersCollections.updateOne(filter, updatedUser)
            return res.send(result)


        })


        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            // console.log(user)
            const filter = { email: email }
            const options = { upsert: true }
            const updatedUser = {
                $set: user
            }
            const result = await usersCollections.updateOne(filter, updatedUser, options)
            const token = jwt.sign({ email: email },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '1h' }
            )
            res.send({ result, token })
        })



        // service Route 
        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollections.find(query).project({ name: 1 })
            const result = await cursor.toArray()
            res.send(result)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get all services 
            const services = await servicesCollections.find().toArray()
            // step 2: get the booking of that day
            const query = { date: date }
            const bookings = await bookingsCollections.find(query).toArray()
            // step 3: for each service, find bookings for that service 
            services.forEach(service => {
                const serviceBookings = bookings.filter(b => b.treatmentName === service.name)
                const booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })
            res.send(services)

        })


        // booking Route 
        // using email to filter
        app.get('/bookings', verifyJWT, async (req, res) => {
            const patientEmail = req.query.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail !== patientEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            // console.log(authorization)
            const query = { email: patientEmail };
            const result = await bookingsCollections.find(query).toArray()
            res.send(result)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            // console.log(booking)
            const query = { treatmentName: booking.treatmentName, email: booking.email, date: booking.date }
            const exists = await bookingsCollections.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingsCollections.insertOne(booking)
            res.send({ success: true, result })
        })


        // Doctors route  
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = await doctorsCollections.find().toArray()
            res.send(doctor)
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            // console.log(doctor)
            const query = { name: doctor.name, email: doctor.email }
            const exists = await doctorsCollections.findOne(query)
            if (exists) {
                return res.send({ success: false, doctor: exists })
            }
            const result = await doctorsCollections.insertOne(doctor)
            res.send({ success: true, result })
        })

        // doctor delete
        app.delete('/doctor/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) }
            const result = await doctorsCollections.deleteOne(filter)
            res.send(result)
        })

        // user delete
        app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) }
            const result = await usersCollections.deleteOne(filter)
            res.send(result)
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Doctors portal is Running')
})


app.listen(port, () => {
    console.log(`Doctors Portal is Running on ${port}`)
})