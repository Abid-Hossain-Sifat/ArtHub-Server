import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
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
  }),
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`Server Open on this Port: ${Port}`);
});

const run = async () => {
  try {
    await client.connect();
    const Data = client.db("ArtHub");
    const ArtWorks = Data.collection("ArtWorks");
    const User = Data.collection("user");
    const PurchasesArtworks = Data.collection("purchasesArtworks");

    app.get("/artworks", async (req, res) => {
      try {
        const { search, category, status, sort, artistId, page, limit } =
          req.query;
        let query = {};

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { artistName: { $regex: search, $options: "i" } },
          ];
        }

        if (category) {
          query.category = category;
        }

        if (status) {
          query.status = status;
        }

        if (artistId) {
          query.artistId = artistId;
        }

        let sortOption = {};
        if (sort === "a-z") {
          sortOption.title = 1;
        } else if (sort === "z-a") {
          sortOption.title = -1;
        } else if (sort === "low-to-high") {
          sortOption.price = 1;
        } else if (sort === "high-to-low") {
          sortOption.price = -1;
        }

        let cursor = ArtWorks.find(query);
        if (Object.keys(sortOption).length > 0) {
          cursor = cursor.sort(sortOption);
        }

        if (page) {
          const parsedPage = parseInt(page, 10) || 1;
          const parsedLimit = parseInt(limit, 10) || 12;
          const skip = (parsedPage - 1) * parsedLimit;

          const totalCount = await ArtWorks.countDocuments(query);
          const artworks = await cursor.skip(skip).limit(parsedLimit).toArray();

          res.send({
            artworks,
            totalCount,
            totalPages: Math.ceil(totalCount / parsedLimit),
            currentPage: parsedPage,
          });
        } else {
          const final = await cursor.toArray();
          res.send(final);
        }
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
    // Filter
    app.get("/artworks/filters", async (req, res) => {
      try {
        const categories = await ArtWorks.distinct("category");
        const statuses = await ArtWorks.distinct("status");
        res.send({
          categories: categories.filter(Boolean),
          statuses: statuses.filter(Boolean),
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/artworks", async (req, res) => {
      try {
        const {
          title,
          category,
          description,
          price,
          image,
          artistName,
          artistEmail,
          artistId,
        } = req.body;

        if (
          !title ||
          !category ||
          !price ||
          !image ||
          !artistName ||
          !artistEmail
        ) {
          return res.status(400).send({ error: "Missing required fields" });
        }

        const newArtwork = {
          title,
          category,
          description: description || "",
          price: parseFloat(price),
          image,
          artistName,
          artistEmail,
          artistId: artistId || null,
          status: "available",
          isSold: false,
          createdAt: new Date().toISOString(),
          purchasedBy: null,
        };

        const result = await ArtWorks.insertOne(newArtwork);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/artworks/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid artwork id" });
        }

        const { title, category, description, price } = req.body;
        const updateFields = {};

        if (title !== undefined) updateFields.title = title;
        if (category !== undefined) updateFields.category = category;
        if (description !== undefined) updateFields.description = description;
        if (price !== undefined) {
          const parsedPrice = parseFloat(price);
          if (Number.isNaN(parsedPrice)) {
            return res.status(400).send({ error: "Invalid price" });
          }
          updateFields.price = parsedPrice;
        }

        if (Object.keys(updateFields).length === 0) {
          return res
            .status(400)
            .send({ error: "No artwork fields provided to update" });
        }

        const result = await ArtWorks.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields },
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Artwork not found" });
        }

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.delete("/artworks/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid artwork id" });
        }

        const result = await ArtWorks.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Artwork not found" });
        }

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/purchase/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const { buyerId, buyerName, buyerEmail } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            error: "Invalid artwork id",
          });
        }

        if (!ObjectId.isValid(buyerId)) {
          return res.status(400).send({
            error: "Invalid buyer id",
          });
        }

        const artwork = await ArtWorks.findOne({
          _id: new ObjectId(id),
        });

        const buyer = await User.findOne({
          _id: new ObjectId(buyerId),
        });

        if (!buyer) {
          return res.status(404).send({
            error: "Buyer not found",
          });
        }

        if (!artwork) {
          return res.status(404).send({
            error: "Artwork not found",
          });
        }

        if (artwork.artistId === buyerId) {
          return res.status(400).send({
            error: "Artists cannot purchase their own artwork",
          });
        }

        if (buyer.role === "artist") {
          return res.status(403).send({
            error: "Artist accounts cannot purchase artworks",
          });
        }

        if (artwork.isSold) {
          return res.status(400).send({
            error: "Artwork already sold",
          });
        }

        const purchaseData = {
          artworkId: artwork._id.toString(),
          artworkTitle: artwork.title,
          artworkImage: artwork.image,
          artworkCategory: artwork.category,
          price: artwork.price,

          artistId: artwork.artistId,
          artistName: artwork.artistName,

          buyerId,
          buyerName,
          buyerEmail,

          purchasedAt: new Date().toISOString(),
        };

        await PurchasesArtworks.insertOne(purchaseData);

        await ArtWorks.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status: "sold",
              isSold: true,
              purchasedBy: buyerName,
            },
          },
        );

        res.send({
          success: true,
          message: "Artwork purchased successfully",
        });
      } catch (error) {
        res.status(500).send({
          error: error.message,
        });
      }
    });

    app.get("/user", async (req, res) => {
      const use = User.find();
      const user = await use.toArray();
      res.send(user);
    });

    app.patch("/user/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const result = await User.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          },
        );

        res.send({
          success: true,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("ping deployed");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
};

run().then(() => {
  app.listen(Port, (req, res) => {
    console.log(`Server Successfully Run on ${Port}`);
  });
});
