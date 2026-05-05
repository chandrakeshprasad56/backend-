const CATEGORY_FALLBACKS = {
  Medicine:
    "https://images.pexels.com/photos/593451/pexels-photo-593451.jpeg?cs=srgb&dl=pexels-pixabay-593451.jpg&fm=jpg",
  Grocery:
    "https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?cs=srgb&dl=pexels-pixabay-264636.jpg&fm=jpg",
  Electronics:
    "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg",
  Fashion:
    "https://images.pexels.com/photos/934070/pexels-photo-934070.jpeg?cs=srgb&dl=pexels-godisable-jacob-934070.jpg&fm=jpg",
  Beauty:
    "https://images.pexels.com/photos/2113855/pexels-photo-2113855.jpeg?cs=srgb&dl=pexels-suzy-hazelwood-2113855.jpg&fm=jpg",
  Hardware:
    "https://images.pexels.com/photos/209235/pexels-photo-209235.jpeg?cs=srgb&dl=pexels-pixabay-209235.jpg&fm=jpg",
  Stationery:
    "https://images.pexels.com/photos/159731/pen-notebook-student-school-159731.jpeg?cs=srgb&dl=pexels-pixabay-159731.jpg&fm=jpg",
  "Home Essentials":
    "https://images.pexels.com/photos/1352191/pexels-photo-1352191.jpeg?cs=srgb&dl=pexels-dariashevtsova-1352191.jpg&fm=jpg",
};

const BLOCKED_IMAGE_REGEX = /(6192127|34939748)/i;

const toCategory = (category) => {
  const value = String(category || "").trim();
  return CATEGORY_FALLBACKS[value] ? value : "Home Essentials";
};

const fallbackForCategory = (category) =>
  CATEGORY_FALLBACKS[toCategory(category)];

const isRemoteUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const normalizePublicImage = (value, category) => {
  const raw = String(value || "").trim();
  if (!raw || BLOCKED_IMAGE_REGEX.test(raw)) return fallbackForCategory(category);
  if (isRemoteUrl(raw)) return raw;
  // Local filenames/uploads are usually not reachable on hosted free deployments.
  return fallbackForCategory(category);
};

module.exports = {
  fallbackForCategory,
  normalizePublicImage,
};

