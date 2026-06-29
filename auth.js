import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { jwt } from "better-auth/plugins";

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("not find mongodb uri");
}

export const client = new MongoClient(uri);
await client.connect();
const db = client.db("ArtHub");
const User = db.collection("user");

export const auth = betterAuth({
  plugins: [
  jwt({
    jwt: { expirationTime: "7d" },
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7 // 7 days
    }
  })
],
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
    },
  },
  trustedOrigins: [process.env.CLIENT_URL],
  user: {
  additionalFields: {
    role: {
      type: "string",
      required: false,
      defaultValue: "user",
    },

    subscription: {
      type: "object",
      required: false,
    },
  },

  changeEmail: {
    enabled: true,
    updateEmailWithoutVerification: true,
  },
},
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return {
            data: {
              ...user,
              role: user.role || "user",
            },
          };
        },

        after: async (user) => {
          await User.updateOne(
            {
              email: user.email,
            },
            {
              $set: {
                subscription: {
                  plan: "free",
                  purchaseLimit: 3,
                  purchasedThisMonth: 0,
                  currentMonth: new Date().toISOString().slice(0, 7),
                },
              },
            },
          );
        },
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: false,
  },
});
