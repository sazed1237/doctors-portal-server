const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
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

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const servicesCollections = client.db("doctors_portal").collection("service");
        const bookingsCollections = client.db("doctors_portal").collection("booking");
        const usersCollections = client.db("doctors_portal").collection("users");


        // User route
        app.put('/users/:email', async(req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email}
            const options = {upsert: true}
            const updatedUser = {
                $set: user
            }
            const result = await usersCollections.updateOne(filter, updatedUser, options)
            res.send(result)

        })



        // service Route 
        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollections.find(query)
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
        app.get('/bookings', async (req, res) => {
            const patientEmail = req.query.email;
            // const patientDate = req.query.date;
            const query = {email: patientEmail};
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