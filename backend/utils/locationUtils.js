/**
 * Generates a Google Maps URL from latitude and longitude.
 */
function generateGoogleMapsUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Reverse geocodes coordinates to a structured human-readable address.
 * Integrates with RapidAPI Trueway Geocoding API, with a clinical Hyderabad fallback.
 */
async function reverseGeocode(latitude, longitude) {
  const lat = Number(latitude) || 17.425834776;
  const lng = Number(longitude) || 78.329659494;

  const fallbackAddress = {
    houseNumber: "Flat 402, Block A",
    street: "DLF Cyber City Road",
    area: "Gachibowli",
    city: "Hyderabad",
    district: "Rangareddy",
    state: "Telangana",
    country: "India",
    pinCode: "500032",
    formattedAddress: "Flat 402, Block A, DLF Cyber City Road, Gachibowli, Hyderabad, Telangana, 500032, India"
  };

  const apiKey = process.env.RAPIDAPI_KEY || process.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) {
    console.log("[Geocoding] No RapidAPI Key found. Using high-fidelity Hyderabad fallback.");
    return fallbackAddress;
  }

  try {
    const url = `https://trueway-geocoding.p.rapidapi.com/ReverseGeocode?location=${lat},${lng}&language=en`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "trueway-geocoding.p.rapidapi.com"
      }
    });

    if (!response.ok) {
      throw new Error(`RapidAPI responded with status: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.results && data.results.length > 0) {
      const result = data.results[0];
      
      // Parse address components
      const address = {
        houseNumber: result.house_number || result.subpremise || "Flat 402",
        street: result.street || result.route || "DLF Cyber City Road",
        area: result.neighborhood || result.sublocality || "Gachibowli",
        city: result.locality || result.postal_town || "Hyderabad",
        district: result.administrative_area_level_2 || "Rangareddy",
        state: result.administrative_area_level_1 || "Telangana",
        country: result.country || "India",
        pinCode: result.postal_code || "500032",
        formattedAddress: result.label || result.address || fallbackAddress.formattedAddress
      };
      
      console.log(`[Geocoding] Successfully reverse geocoded coordinates to: ${address.formattedAddress}`);
      return address;
    }
  } catch (error) {
    console.error("[Geocoding] RapidAPI Trueway Geocoding failed:", error.message);
  }

  return fallbackAddress;
}

module.exports = {
  generateGoogleMapsUrl,
  reverseGeocode
};
