/**
 * Generates a Google Maps URL from latitude and longitude.
 */
function generateGoogleMapsUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

module.exports = {
  generateGoogleMapsUrl
};
