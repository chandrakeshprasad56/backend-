const path = require("path");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const User = require("../models/User");
const Shop = require("../models/Shop");
const Product = require("../models/Product");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const categories = [
  "Medicine",
  "Grocery",
  "Electronics",
  "Fashion",
  "Beauty",
  "Hardware",
  "Stationery",
  "Home Essentials",
];

const categoryImages = {
  Medicine: [
    "https://images.pexels.com/photos/3683071/pexels-photo-3683071.jpeg?cs=srgb&dl=pexels-shvetsa-3683071.jpg&fm=jpg",
    "https://images.pexels.com/photos/593451/pexels-photo-593451.jpeg?cs=srgb&dl=pexels-pixabay-593451.jpg&fm=jpg",
    "https://images.pexels.com/photos/3786154/pexels-photo-3786154.jpeg?cs=srgb&dl=pexels-karolina-grabowska-3786154.jpg&fm=jpg",
    "https://images.pexels.com/photos/3683093/pexels-photo-3683093.jpeg?cs=srgb&dl=pexels-shvetsa-3683093.jpg&fm=jpg",
  ],
  Grocery: [
    "https://images.pexels.com/photos/29145877/pexels-photo-29145877.jpeg?cs=srgb&dl=pexels-bertoli-29145877.jpg&fm=jpg",
    "https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?cs=srgb&dl=pexels-pixabay-264636.jpg&fm=jpg",
    "https://images.pexels.com/photos/4198023/pexels-photo-4198023.jpeg?cs=srgb&dl=pexels-karolina-grabowska-4198023.jpg&fm=jpg",
    "https://images.pexels.com/photos/4393664/pexels-photo-4393664.jpeg?cs=srgb&dl=pexels-karolina-grabowska-4393664.jpg&fm=jpg",
  ],
  Electronics: [
    "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg",
    "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg",
    "https://images.pexels.com/photos/1334597/pexels-photo-1334597.jpeg?cs=srgb&dl=pexels-jess-bailey-designs-1334597.jpg&fm=jpg",
    "https://images.pexels.com/photos/275789/pexels-photo-275789.jpeg?cs=srgb&dl=pexels-pixabay-275789.jpg&fm=jpg",
  ],
  Fashion: [
    "https://images.pexels.com/photos/3927390/pexels-photo-3927390.jpeg?cs=srgb&dl=pexels-cottonbro-3927390.jpg&fm=jpg",
    "https://images.pexels.com/photos/934070/pexels-photo-934070.jpeg?cs=srgb&dl=pexels-godisable-jacob-934070.jpg&fm=jpg",
    "https://images.pexels.com/photos/1488463/pexels-photo-1488463.jpeg?cs=srgb&dl=pexels-olly-1488463.jpg&fm=jpg",
    "https://images.pexels.com/photos/298863/pexels-photo-298863.jpeg?cs=srgb&dl=pexels-pixabay-298863.jpg&fm=jpg",
  ],
  Beauty: [
    "https://images.pexels.com/photos/34939748/pexels-photo-34939748.jpeg?cs=srgb&dl=pexels-prolificpeople-34939748.jpg&fm=jpg",
    "https://images.pexels.com/photos/2113855/pexels-photo-2113855.jpeg?cs=srgb&dl=pexels-suzy-hazelwood-2113855.jpg&fm=jpg",
    "https://images.pexels.com/photos/7581570/pexels-photo-7581570.jpeg?cs=srgb&dl=pexels-cottonbro-7581570.jpg&fm=jpg",
    "https://images.pexels.com/photos/965731/pexels-photo-965731.jpeg?cs=srgb&dl=pexels-pixabay-965731.jpg&fm=jpg",
  ],
  Hardware: [
    "https://images.pexels.com/photos/4489702/pexels-photo-4489702.jpeg?cs=srgb&dl=pexels-ono-kosuki-4489702.jpg&fm=jpg",
    "https://images.pexels.com/photos/209235/pexels-photo-209235.jpeg?cs=srgb&dl=pexels-pixabay-209235.jpg&fm=jpg",
    "https://images.pexels.com/photos/162553/pexels-photo-162553.jpeg?cs=srgb&dl=pexels-pixabay-162553.jpg&fm=jpg",
    "https://images.pexels.com/photos/159306/construction-site-build-construction-work-159306.jpeg?cs=srgb&dl=pexels-pixabay-159306.jpg&fm=jpg",
  ],
  Stationery: [
    "https://images.pexels.com/photos/6192508/pexels-photo-6192508.jpeg?cs=srgb&dl=pexels-ekaterina-bolovtsova-6192508.jpg&fm=jpg",
    "https://images.pexels.com/photos/5088009/pexels-photo-5088009.jpeg?cs=srgb&dl=pexels-karolina-grabowska-5088009.jpg&fm=jpg",
    "https://images.pexels.com/photos/4792733/pexels-photo-4792733.jpeg?cs=srgb&dl=pexels-karolina-grabowska-4792733.jpg&fm=jpg",
    "https://images.pexels.com/photos/159731/pen-notebook-student-school-159731.jpeg?cs=srgb&dl=pexels-pixabay-159731.jpg&fm=jpg",
  ],
  "Home Essentials": [
    "https://images.pexels.com/photos/5546867/pexels-photo-5546867.jpeg?cs=srgb&dl=pexels-polina-kovaleva-5546867.jpg&fm=jpg",
    "https://images.pexels.com/photos/1352191/pexels-photo-1352191.jpeg?cs=srgb&dl=pexels-dariashevtsova-1352191.jpg&fm=jpg",
    "https://images.pexels.com/photos/5825570/pexels-photo-5825570.jpeg?cs=srgb&dl=pexels-ono-kosuki-5825570.jpg&fm=jpg",
    "https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?cs=srgb&dl=pexels-vecislavas-popa-1080721.jpg&fm=jpg",
  ],
};

const categoryProducts = {
  Medicine: [
    "Paracetamol Tablets",
    "Vitamin C Capsules",
    "Digital Thermometer",
    "BP Monitor",
    "Cough Syrup",
    "Antacid Tablets",
    "Pain Relief Gel",
    "Hand Sanitizer",
    "Face Mask Pack",
    "First Aid Kit",
    "Allergy Tablets",
    "Glucose Powder",
    "Bandage Roll",
    "Oximeter",
    "Nebulizer",
    "Multivitamin Syrup",
    "Eye Drops",
    "Nasal Spray",
    "Antiseptic Liquid",
    "Hot Water Bag",
  ],
  Grocery: [
    "Basmati Rice 5kg",
    "Wheat Flour 10kg",
    "Sugar 1kg",
    "Tea Powder",
    "Coffee Jar",
    "Cooking Oil 1L",
    "Turmeric Powder",
    "Red Chilli Powder",
    "Salt Pack",
    "Toor Dal",
    "Chana Dal",
    "Masoor Dal",
    "Corn Flakes",
    "Biscuits Pack",
    "Noodles",
    "Pasta",
    "Ketchup Bottle",
    "Honey Jar",
    "Dry Fruits Mix",
    "Ghee 1L",
  ],
  Electronics: [
    "Smartphone 128GB",
    "Wireless Earbuds",
    "Bluetooth Speaker",
    "Smartwatch",
    "Laptop 15-inch",
    "Gaming Mouse",
    "Mechanical Keyboard",
    "USB-C Charger",
    "Power Bank 20000mAh",
    "LED Monitor 24-inch",
    "WiFi Router",
    "Portable SSD 1TB",
    "Action Camera",
    "DSLR Camera",
    "Smart TV 43-inch",
    "Tablet 10-inch",
    "Noise Cancelling Headphones",
    "Webcam HD",
    "Printer All-in-One",
    "VR Headset",
  ],
  Fashion: [
    "Men Slim Fit Jeans",
    "Women Kurti",
    "Casual T-Shirt",
    "Formal Shirt",
    "Hoodie",
    "Sports Track Pants",
    "Women Saree",
    "Kids T-Shirt",
    "Denim Jacket",
    "Sneakers",
    "Sandals",
    "Handbag",
    "Sunglasses",
    "Wrist Watch",
    "Cap",
    "Running Shoes",
    "Cotton Shorts",
    "Winter Sweater",
    "Leather Belt",
    "Polo T-Shirt",
  ],
  Beauty: [
    "Face Wash",
    "Moisturizer",
    "Sunscreen SPF50",
    "Lipstick",
    "Eyeliner",
    "Mascara",
    "Foundation",
    "Compact Powder",
    "Face Serum",
    "Hair Oil",
    "Shampoo",
    "Conditioner",
    "Body Lotion",
    "Perfume",
    "Nail Polish",
    "Makeup Remover",
    "Body Wash",
    "Face Mask Pack",
    "Hair Dryer",
    "Beard Trimmer",
  ],
  Hardware: [
    "Hammer",
    "Screwdriver Set",
    "Power Drill",
    "Pliers",
    "Wrench Set",
    "Measuring Tape",
    "Nails Pack",
    "Screw Pack",
    "Angle Grinder",
    "Safety Gloves",
    "Safety Goggles",
    "Tool Box",
    "Utility Knife",
    "Ladder",
    "Paint Brush Set",
    "Wall Plugs",
    "PVC Pipe",
    "Garden Hose",
    "Torch Light",
    "Silicone Sealant",
  ],
  Stationery: [
    "Notebook A4",
    "Ball Pen Pack",
    "Gel Pen Pack",
    "Pencil Box",
    "Eraser Set",
    "Sharpener",
    "Sketchbook",
    "Color Pencils",
    "Marker Set",
    "Highlighter",
    "Sticky Notes",
    "Stapler",
    "Paper Clips",
    "Files Folder",
    "Calculator",
    "Geometry Box",
    "Whiteboard Marker",
    "Scissors",
    "Glue Stick",
    "Printer Paper 500 Sheets",
  ],
  "Home Essentials": [
    "Bedsheet Set",
    "Pillow",
    "Bath Towel",
    "Curtains",
    "Doormat",
    "LED Bulb",
    "Extension Cord",
    "Kitchen Storage Set",
    "Water Bottle",
    "Lunch Box",
    "Gas Lighter",
    "Pressure Cooker",
    "Nonstick Pan",
    "Coffee Mug",
    "Wall Clock",
    "Room Freshener",
    "Laundry Basket",
    "Iron",
    "Vacuum Cleaner",
    "Air Cooler",
  ],
};

const shopsTemplate = [
  {
    shopName: "Noida MedCare",
    description: "Trusted pharmacy for daily healthcare needs.",
    logo: categoryImages.Medicine[0],
    address: "Sector 18, Noida",
    city: "Noida",
    categories: ["Medicine"],
    openingHours: "09:00-22:00",
    isVerified: true,
    hasOffers: true,
    coordinates: [77.3260, 28.5708],
  },
  {
    shopName: "FreshCart Grocery",
    description: "Fresh groceries delivered fast.",
    logo: categoryImages.Grocery[0],
    address: "Sector 62, Noida",
    city: "Noida",
    categories: ["Grocery"],
    openingHours: "08:00-22:00",
    isVerified: true,
    hasOffers: true,
    coordinates: [77.3649, 28.6270],
  },
  {
    shopName: "TechHub Electronics",
    description: "Latest gadgets and electronics.",
    logo: categoryImages.Electronics[0],
    address: "Sector 16, Noida",
    city: "Noida",
    categories: ["Electronics"],
    openingHours: "10:00-21:00",
    isVerified: true,
    hasOffers: false,
    coordinates: [77.3152, 28.5832],
  },
  {
    shopName: "StyleStreet Fashion",
    description: "Trending fashion for every season.",
    logo: categoryImages.Fashion[0],
    address: "Pari Chowk, Greater Noida",
    city: "Greater Noida",
    categories: ["Fashion"],
    openingHours: "10:00-21:30",
    isVerified: false,
    hasOffers: true,
    coordinates: [77.5030, 28.4744],
  },
  {
    shopName: "GlowUp Beauty",
    description: "Beauty essentials and cosmetics.",
    logo: categoryImages.Beauty[0],
    address: "Alpha 1, Greater Noida",
    city: "Greater Noida",
    categories: ["Beauty"],
    openingHours: "10:00-21:00",
    isVerified: false,
    hasOffers: true,
    coordinates: [77.5126, 28.4777],
  },
  {
    shopName: "BuildRight Hardware",
    description: "Tools and hardware supplies.",
    logo: categoryImages.Hardware[0],
    address: "Sector 1, Greater Noida West",
    city: "Greater Noida",
    categories: ["Hardware"],
    openingHours: "09:00-20:00",
    isVerified: true,
    hasOffers: false,
    coordinates: [77.4317, 28.6011],
  },
  {
    shopName: "PaperNest Stationery",
    description: "Stationery and office essentials.",
    logo: categoryImages.Stationery[0],
    address: "Sector 50, Noida",
    city: "Noida",
    categories: ["Stationery"],
    openingHours: "09:30-20:30",
    isVerified: true,
    hasOffers: false,
    coordinates: [77.3767, 28.5700],
  },
  {
    shopName: "HomeEase Essentials",
    description: "Everything you need for home.",
    logo: categoryImages["Home Essentials"][0],
    address: "Sector 135, Noida",
    city: "Noida",
    categories: ["Home Essentials"],
    openingHours: "09:00-21:00",
    isVerified: true,
    hasOffers: true,
    coordinates: [77.3869, 28.5062],
  },
];

const priceRanges = {
  Medicine: [49, 699],
  Grocery: [30, 799],
  Electronics: [899, 45999],
  Fashion: [199, 3999],
  Beauty: [149, 2999],
  Hardware: [99, 4999],
  Stationery: [25, 799],
  "Home Essentials": [99, 4999],
};

const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomRating = () =>
  Math.round((3.8 + Math.random() * 1.1) * 10) / 10;

const forcedProductImages = {
  "Portable SSD 1TB":
    "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg",
};

const main = async () => {
  try {
    await connectDB();

    let seller = await User.findOne({ email: "seller@digishop.local" });
    if (!seller) {
      seller = await User.create({
        name: "DigiShop Seller",
        email: "seller@digishop.local",
        password: "Seller@123",
        role: "seller",
      });
    }

    const shouldReset = process.argv.includes("--reset");
    if (shouldReset) {
      await Product.deleteMany({ category: { $in: categories } });
      await Shop.deleteMany({ shopName: { $in: shopsTemplate.map((s) => s.shopName) } });
    }

    const shopMap = new Map();
    for (const shop of shopsTemplate) {
        const doc = await Shop.findOneAndUpdate(
        { shopName: shop.shopName },
        {
          shopName: shop.shopName,
          description: shop.description,
          logo: shop.logo,
          address: shop.address,
          city: shop.city,
          categories: shop.categories,
          openingHours: shop.openingHours,
          isVerified: shop.isVerified,
          hasOffers: shop.hasOffers,
          owner: seller._id,
          rating: 4.5,
          location: {
            type: "Point",
            coordinates: shop.coordinates,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      shopMap.set(shop.shopName, doc);
    }

    let created = 0;
    for (const category of categories) {
      const names = categoryProducts[category] || [];
      const shopsForCategory = shopsTemplate.filter((s) => s.categories.includes(category));
      for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        const shopTemplate = shopsForCategory[i % shopsForCategory.length];
        const shopDoc = shopMap.get(shopTemplate.shopName);
        const [minPrice, maxPrice] = priceRanges[category];
        const imagePool = categoryImages[category] || [];
        const image = forcedProductImages[name] || (imagePool.length
          ? imagePool[i % imagePool.length]
          : undefined);
        const product = {
          name,
          price: randomBetween(minPrice, maxPrice),
          category,
          stock: randomBetween(5, 80),
          image,
          shop: shopDoc._id,
          averageRating: randomRating(),
        };
        await Product.updateOne(
          { name: product.name, shop: product.shop },
          { $set: product },
          { upsert: true }
        );
        created += 1;
      }
    }

    console.log(`Seed complete. Upserted ${created} products and ${shopsTemplate.length} shops.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

main();
