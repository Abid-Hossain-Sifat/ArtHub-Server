import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";

const app = express();
const Port = process.env.PORT;

// CORS setup 
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`Server Open on this Port: ${Port}`);
});

const run = async () => {
  try {
    await client.connect();
    const Data = client.db('ArtHub')
    const ArtWorks = Data.collection('ArtWorks')


    app.get('/artworks', async (req, res) => {
      try {
        const { search, category, status, sort } = req.query;
        let query = {};

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { artistName: { $regex: search, $options: 'i' } }
          ];
        }

        if (category) {
          query.category = category;
        }

        if (status) {
          query.status = status;
        }

        let sortOption = {};
        if (sort === 'a-z') {
          sortOption.title = 1;
        } else if (sort === 'z-a') {
          sortOption.title = -1;
        } else if (sort === 'low-to-high') {
          sortOption.price = 1;
        } else if (sort === 'high-to-low') {
          sortOption.price = -1;
        }

        let cursor = ArtWorks.find(query);
        if (Object.keys(sortOption).length > 0) {
          cursor = cursor.sort(sortOption);
        }
        const final = await cursor.toArray();
        res.send(final);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
          // Filter 
    app.get('/artworks/filters', async (req, res) => {
      try {
        const categories = await ArtWorks.distinct('category');
        const statuses = await ArtWorks.distinct('status');
        res.send({
          categories: categories.filter(Boolean),
          statuses: statuses.filter(Boolean)
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    await client.db('admin').command({ ping: 1 });
    console.log('ping deployed')


  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
};

run().then(() => {
  app.listen(Port, () => {
    console.log(`Server Successfully Run on ${Port}`);
  });
});