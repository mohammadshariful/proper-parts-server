const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(express.json());
app.use(cors());

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//verify jwt / authentication
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECURE, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.cw6pj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db("proper_parts").collection("tools");
    const purchaseCollection = client.db("proper_parts").collection("purchase");
    const reviewsCollection = client.db("proper_parts").collection("reviews");
    const usersCollection = client.db("proper_parts").collection("users");
    const profileCollection = client.db("proper_parts").collection("profile");
    const paymentsCollection = client.db("proper_parts").collection("payments");

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };
    /* --------------Tools Collection Api Start----------------------- */
    //tools get api
    app.get("/tools", async (req, res) => {
      const tools = await toolsCollection.find().toArray();
      res.send(tools);
    });
    // added tools api
    app.post("/tools", verifyJWT, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await toolsCollection.insertOne(product);
      res.send(result);
    });
    // find single tool
    app.get("/tools/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolsCollection.findOne(query);
      res.send(result);
    });
    // delete product api
    app.delete("/tools/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await toolsCollection.deleteOne(filter);
      res.send(result);
    });
    /* --------------Tools Collection Api End----------------------- */
    /* --------------Purchases Collection Api Start----------------------- */
    // get my purchase  api
    app.get("/purchase/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const myPurchase = await purchaseCollection
        .find({ email: email })
        .toArray();
      res.send(myPurchase);
    });
    // purchase collection api
    app.post("/purchase", verifyJWT, async (req, res) => {
      const purchase = req.body;
      const result = await purchaseCollection.insertOne(purchase);
      res.send(result);
    });
    // delete my purchase collection
    app.delete("/myPurchase/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await purchaseCollection.deleteOne(filter);
      res.send(result);
    });
    // get my purchase single collection
    app.get("/myPurchase/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await purchaseCollection.findOne(filter);
      res.send(result);
    });

    //create payment intent api
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });
    // update perchase api

    app.patch("/myPurchase/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          status: "pending",
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentsCollection.insertOne(payment);
      const updatedBooking = await purchaseCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(updateDoc);
    });
    //manage all orders api
    app.get("/manageOrder", verifyJWT, async (req, res) => {
      const allOrders = await purchaseCollection.find().toArray();
      res.send(allOrders);
    });
    //orders update api
    app.patch("/manageOrder/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "shipped",
        },
      };
      const result = await purchaseCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete unpaid order api
    app.delete("/manageOrder/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await purchaseCollection.deleteOne(filter);
      res.send(result);
    });

    /* --------------Purchases Collection Api End----------------------- */

    /* --------------Reviews Collection Api Start point----------------------- */
    //get reviews api
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    });

    //post review api
    app.post("/reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    /* --------------Reviews Collection Api End----------------------- */
    /* --------------User Collection Api Start----------------------- */
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECURE,
        {
          expiresIn: "10d",
        }
      );
      res.send({ result, token });
    });
    //get all users
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });
    //make admin user api
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // check the user is admin or not api
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    /* --------------User Collection Api End----------------------- */

    /* --------------Profile Update Collection Api Start----------------------- */
    //profile update api
    app.put("/update/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const update = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          city: update.city,
          education: update.education,
          phone: update.phone,
          link: update.link,
        },
      };
      const result = await profileCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //profile get api
    app.get("/updateInfo/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await profileCollection.findOne(filter);
      res.send(result);
    });

    /* --------------Profile Update Collection Api Edn----------------------- */
  } finally {
    //   client.close();
  }
}

run().catch(console.dir);

//root api
app.get("/", (req, res) => {
  res.send("proper parts server running");
});
//port listent
app.listen(port, () => {
  console.log(`proper parts server running ${port}`);
});
