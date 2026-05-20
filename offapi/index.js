const express = require("express");
const { MongoClient } = require("mongodb");
const rateLimit = require("express-rate-limit");

const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "off";
const COLLECTION = "products";

const app = express();
let collection;

// Rate limiting: 60 req/min на IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 0, status_verbose: "Too many requests, please slow down." },
});
app.use(limiter);

app.use((req, res, next) => {
  res.setHeader("X-Data-Source", "Open Food Facts - https://world.openfoodfacts.org");
  res.setHeader("X-Data-License", "ODbL - https://opendatacommons.org/licenses/odbl/1.0/");
  next();
});

// GET /api/v2/product/:barcode - OFF-совместимый эндпоинт
// Совместимость: HTTP 200 для not found (как у OFF), поддержка ?fields=
app.get("/api/v2/product/:barcode", async (req, res) => {
  const { barcode } = req.params;
  const { fields } = req.query;

  if (!/^\d{4,14}$/.test(barcode)) {
    return res.status(200).json({ status: 0, status_verbose: "invalid barcode" });
  }

  try {
    const projection = { _id: 0 };
    if (fields) fields.split(",").forEach((f) => (projection[f.trim()] = 1));

    const product = await collection.findOne({ code: barcode }, { projection });

    if (!product) {
      return res.status(200).json({ status: 0, status_verbose: "product not found" });
    }

    res.json({ status: 1, status_verbose: "product found", product });
  } catch (err) {
    console.error("Query error:", err.message);
    res.status(500).json({ status: 0, status_verbose: "internal error" });
  }
});

// GET /api/v2/search?code=&fields= - поиск по нескольким штрихкодам
app.get("/api/v2/search", async (req, res) => {
  const { code, fields, page = 1, page_size = 24 } = req.query;

  const filter = {};
  if (code) filter.code = { $in: code.split(",").map((c) => c.trim()) };

  const projection = { _id: 0 };
  if (fields) fields.split(",").forEach((f) => (projection[f.trim()] = 1));

  const skip = (Number(page) - 1) * Number(page_size);

  try {
    const [products, count] = await Promise.all([
      collection.find(filter, { projection }).skip(skip).limit(Number(page_size)).toArray(),
      collection.countDocuments(filter),
    ]);

    res.json({
      status: 1,
      count,
      page: Number(page),
      page_size: Number(page_size),
      page_count: Math.ceil(count / Number(page_size)),
      products,
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ status: 0, status_verbose: "internal error" });
  }
});

// GET /api/v3/product/:barcode - OFF API v3 (правильные HTTP коды, structured response)
app.get("/api/v3/product/:barcode", async (req, res) => {
  const { barcode } = req.params;
  const { fields } = req.query;

  if (!/^\d{4,14}$/.test(barcode)) {
    return res.status(400).json({
      result: { id: "invalid_barcode", name: "Invalid barcode" },
      errors: [{ field: { id: "barcode" }, impact: { id: "invalid_barcode" } }],
      warnings: [],
    });
  }

  try {
    const projection = { _id: 0 };
    if (fields) fields.split(",").forEach((f) => (projection[f.trim()] = 1));

    const product = await collection.findOne({ code: barcode }, { projection });

    if (!product) {
      return res.status(404).json({
        result: { id: "product_not_found", name: "Product not found" },
        errors: [{ field: { id: "product_not_found" }, impact: { id: "no_impact" } }],
        warnings: [],
      });
    }

    res.json({
      product,
      result: { id: "product_found", name: "Product found" },
      errors: [],
      warnings: [],
    });
  } catch (err) {
    console.error("v3 query error:", err.message);
    res.status(500).json({
      result: { id: "internal_error", name: "Internal error" },
      errors: [{ field: { id: "server" }, impact: { id: "internal_error" } }],
      warnings: [],
    });
  }
});

// GET /api/v3/search - v3 поиск
app.get("/api/v3/search", async (req, res) => {
  const { code, fields, page = 1, page_size = 24 } = req.query;

  const filter = {};
  if (code) filter.code = { $in: code.split(",").map((c) => c.trim()) };

  const projection = { _id: 0 };
  if (fields) fields.split(",").forEach((f) => (projection[f.trim()] = 1));

  const skip = (Number(page) - 1) * Number(page_size);

  try {
    const [products, count] = await Promise.all([
      collection.find(filter, { projection }).skip(skip).limit(Number(page_size)).toArray(),
      collection.countDocuments(filter),
    ]);

    res.json({
      products,
      count,
      page: Number(page),
      page_size: Number(page_size),
      page_count: Math.ceil(count / Number(page_size)),
      result: { id: "products_found", name: "Products found" },
      errors: [],
      warnings: [],
    });
  } catch (err) {
    console.error("v3 search error:", err.message);
    res.status(500).json({
      result: { id: "internal_error", name: "Internal error" },
      errors: [],
      warnings: [],
    });
  }
});

app.get("/health", (req, res) => {
  if (!collection) return res.status(503).json({ status: "connecting" });
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.json({
    name: "Open Food Facts Mirror API",
    source: "https://world.openfoodfacts.org",
    license: "ODbL - https://opendatacommons.org/licenses/odbl/1.0/",
    endpoints: {
      "v2.product": "/api/v2/product/{barcode}",
      "v2.search": "/api/v2/search?code={barcode}&fields={fields}",
      "v3.product": "/api/v3/product/{barcode}",
      "v3.search": "/api/v3/search?code={barcode}&fields={fields}",
    },
  });
});

app.listen(PORT, () => console.log(`offapi listening on :${PORT}`));

async function connectMongo() {
  while (true) {
    try {
      const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      console.log("Connected to MongoDB");
      collection = client.db(DB_NAME).collection(COLLECTION);
      return;
    } catch (err) {
      console.error("MongoDB not ready, retrying in 10s:", err.message);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

connectMongo();
