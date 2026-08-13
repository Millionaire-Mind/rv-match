/**
 * Approximate US ZIP3-prefix centroids (first 3 digits of a ZIP code ->
 * approximate lat/lng of that region). This intentionally trades precision
 * for zero external dependency: no geocoding API key is required to run
 * RV Match. It's accurate enough for "which dealers are roughly within N
 * miles" radius filtering, which is inherently an approximation anyway.
 * Coverage: major US metro areas. Unlisted prefixes fall back to a
 * regional estimate in `geocodeZip`.
 */
export const ZIP3_CENTROIDS: Record<string, { lat: number; lng: number; label: string }> = {
  "010": { lat: 42.29, lng: -72.6, label: "Springfield, MA" },
  "021": { lat: 42.36, lng: -71.06, label: "Boston, MA" },
  "028": { lat: 41.82, lng: -71.41, label: "Providence, RI" },
  "030": { lat: 43.0, lng: -71.45, label: "Manchester, NH" },
  "041": { lat: 43.66, lng: -70.26, label: "Portland, ME" },
  "050": { lat: 44.26, lng: -72.58, label: "White River Junction, VT" },
  "060": { lat: 41.76, lng: -72.68, label: "Hartford, CT" },
  "070": { lat: 40.73, lng: -74.17, label: "Newark, NJ" },
  "085": { lat: 40.22, lng: -74.76, label: "Trenton, NJ" },
  "100": { lat: 40.71, lng: -74.0, label: "New York, NY" },
  "112": { lat: 40.65, lng: -73.95, label: "Brooklyn, NY" },
  "117": { lat: 40.79, lng: -73.13, label: "Long Island, NY" },
  "122": { lat: 42.65, lng: -73.75, label: "Albany, NY" },
  "142": { lat: 42.89, lng: -78.88, label: "Buffalo, NY" },
  "146": { lat: 43.16, lng: -77.61, label: "Rochester, NY" },
  "152": { lat: 40.44, lng: -79.99, label: "Pittsburgh, PA" },
  "171": { lat: 40.27, lng: -76.88, label: "Harrisburg, PA" },
  "175": { lat: 41.41, lng: -75.66, label: "Scranton, PA" },
  "190": { lat: 39.95, lng: -75.16, label: "Philadelphia, PA" },
  "191": { lat: 39.96, lng: -75.15, label: "Philadelphia, PA" },
  "197": { lat: 39.74, lng: -75.55, label: "Wilmington, DE" },
  "201": { lat: 38.85, lng: -77.3, label: "Fairfax, VA" },
  "206": { lat: 38.99, lng: -76.94, label: "Silver Spring, MD" },
  "212": { lat: 39.29, lng: -76.61, label: "Baltimore, MD" },
  "200": { lat: 38.9, lng: -77.04, label: "Washington, DC" },
  "220": { lat: 38.03, lng: -78.48, label: "Charlottesville, VA" },
  "232": { lat: 37.54, lng: -77.44, label: "Richmond, VA" },
  "236": { lat: 36.85, lng: -76.29, label: "Norfolk, VA" },
  "241": { lat: 37.27, lng: -79.94, label: "Roanoke, VA" },
  "250": { lat: 38.35, lng: -81.63, label: "Charleston, WV" },
  "260": { lat: 39.28, lng: -80.35, label: "Clarksburg, WV" },
  "270": { lat: 36.1, lng: -80.24, label: "Winston-Salem, NC" },
  "272": { lat: 36.07, lng: -79.79, label: "Greensboro, NC" },
  "276": { lat: 35.99, lng: -78.9, label: "Durham, NC" },
  "277": { lat: 35.78, lng: -78.64, label: "Raleigh, NC" },
  "281": { lat: 35.23, lng: -80.84, label: "Charlotte, NC" },
  "286": { lat: 35.6, lng: -82.55, label: "Asheville, NC" },
  "290": { lat: 34.0, lng: -81.03, label: "Columbia, SC" },
  "294": { lat: 32.78, lng: -79.93, label: "Charleston, SC" },
  "296": { lat: 34.85, lng: -82.4, label: "Greenville, SC" },
  "300": { lat: 33.75, lng: -84.39, label: "Atlanta, GA" },
  "313": { lat: 32.08, lng: -81.09, label: "Savannah, GA" },
  "319": { lat: 32.46, lng: -84.99, label: "Columbus, GA" },
  "320": { lat: 30.33, lng: -81.66, label: "Jacksonville, FL" },
  "327": { lat: 28.54, lng: -81.38, label: "Orlando, FL" },
  "330": { lat: 25.76, lng: -80.19, label: "Miami, FL" },
  "336": { lat: 27.95, lng: -82.46, label: "Tampa, FL" },
  "337": { lat: 27.34, lng: -82.53, label: "Sarasota, FL" },
  "349": { lat: 26.12, lng: -80.14, label: "Fort Lauderdale, FL" },
  "350": { lat: 33.52, lng: -86.8, label: "Birmingham, AL" },
  "360": { lat: 32.37, lng: -86.3, label: "Montgomery, AL" },
  "370": { lat: 36.16, lng: -86.78, label: "Nashville, TN" },
  "375": { lat: 35.05, lng: -85.31, label: "Chattanooga, TN" },
  "377": { lat: 35.96, lng: -83.92, label: "Knoxville, TN" },
  "380": { lat: 35.15, lng: -90.05, label: "Memphis, TN" },
  "390": { lat: 32.3, lng: -90.18, label: "Jackson, MS" },
  "400": { lat: 38.25, lng: -85.76, label: "Louisville, KY" },
  "402": { lat: 38.04, lng: -84.5, label: "Lexington, KY" },
  "410": { lat: 39.1, lng: -84.51, label: "Cincinnati, OH" },
  "430": { lat: 39.96, lng: -83.0, label: "Columbus, OH" },
  "441": { lat: 41.5, lng: -81.7, label: "Cleveland, OH" },
  "452": { lat: 39.76, lng: -84.19, label: "Dayton, OH" },
  "453": { lat: 41.08, lng: -81.52, label: "Akron, OH" },
  "460": { lat: 39.77, lng: -86.16, label: "Indianapolis, IN" },
  "468": { lat: 41.68, lng: -86.25, label: "South Bend, IN" },
  "480": { lat: 42.33, lng: -83.05, label: "Detroit, MI" },
  "490": { lat: 42.97, lng: -85.67, label: "Grand Rapids, MI" },
  "492": { lat: 42.73, lng: -84.56, label: "Lansing, MI" },
  "530": { lat: 43.04, lng: -87.91, label: "Milwaukee, WI" },
  "537": { lat: 43.07, lng: -89.4, label: "Madison, WI" },
  "540": { lat: 44.52, lng: -88.02, label: "Green Bay, WI" },
  "550": { lat: 44.98, lng: -93.27, label: "Minneapolis, MN" },
  "551": { lat: 44.95, lng: -93.09, label: "St. Paul, MN" },
  "553": { lat: 44.02, lng: -92.47, label: "Rochester, MN" },
  "558": { lat: 46.79, lng: -92.1, label: "Duluth, MN" },
  "500": { lat: 41.6, lng: -93.61, label: "Des Moines, IA" },
  "522": { lat: 41.98, lng: -91.66, label: "Cedar Rapids, IA" },
  "630": { lat: 38.63, lng: -90.2, label: "St. Louis, MO" },
  "641": { lat: 39.1, lng: -94.58, label: "Kansas City, MO" },
  "650": { lat: 38.95, lng: -92.33, label: "Columbia, MO" },
  "660": { lat: 39.11, lng: -94.63, label: "Kansas City, KS" },
  "666": { lat: 38.98, lng: -95.24, label: "Lawrence, KS" },
  "670": { lat: 37.69, lng: -97.34, label: "Wichita, KS" },
  "680": { lat: 41.26, lng: -95.94, label: "Omaha, NE" },
  "685": { lat: 40.81, lng: -96.68, label: "Lincoln, NE" },
  "700": { lat: 29.95, lng: -90.07, label: "New Orleans, LA" },
  "708": { lat: 30.45, lng: -91.15, label: "Baton Rouge, LA" },
  "710": { lat: 32.5, lng: -93.75, label: "Shreveport, LA" },
  "720": { lat: 34.75, lng: -92.29, label: "Little Rock, AR" },
  "730": { lat: 35.47, lng: -97.52, label: "Oklahoma City, OK" },
  "741": { lat: 36.15, lng: -95.99, label: "Tulsa, OK" },
  "750": { lat: 32.78, lng: -96.8, label: "Dallas, TX" },
  "760": { lat: 32.75, lng: -97.33, label: "Fort Worth, TX" },
  "770": { lat: 29.76, lng: -95.37, label: "Houston, TX" },
  "782": { lat: 29.42, lng: -98.49, label: "San Antonio, TX" },
  "787": { lat: 30.27, lng: -97.74, label: "Austin, TX" },
  "791": { lat: 33.58, lng: -101.86, label: "Lubbock, TX" },
  "799": { lat: 31.85, lng: -102.37, label: "Odessa, TX" },
  "800": { lat: 39.74, lng: -104.99, label: "Denver, CO" },
  "809": { lat: 38.83, lng: -104.82, label: "Colorado Springs, CO" },
  "820": { lat: 41.14, lng: -104.82, label: "Cheyenne, WY" },
  "830": { lat: 43.6, lng: -116.2, label: "Boise, ID" },
  "840": { lat: 40.76, lng: -111.89, label: "Salt Lake City, UT" },
  "850": { lat: 33.45, lng: -112.07, label: "Phoenix, AZ" },
  "857": { lat: 32.22, lng: -110.97, label: "Tucson, AZ" },
  "870": { lat: 35.08, lng: -106.65, label: "Albuquerque, NM" },
  "890": { lat: 36.17, lng: -115.14, label: "Las Vegas, NV" },
  "894": { lat: 39.53, lng: -119.81, label: "Reno, NV" },
  "900": { lat: 34.05, lng: -118.24, label: "Los Angeles, CA" },
  "920": { lat: 33.3, lng: -117.29, label: "Riverside, CA" },
  "921": { lat: 32.72, lng: -117.16, label: "San Diego, CA" },
  "926": { lat: 33.68, lng: -117.83, label: "Irvine, CA" },
  "928": { lat: 34.1, lng: -117.29, label: "San Bernardino, CA" },
  "930": { lat: 34.42, lng: -119.7, label: "Santa Barbara, CA" },
  "934": { lat: 36.75, lng: -119.77, label: "Fresno, CA" },
  "941": { lat: 37.77, lng: -122.42, label: "San Francisco, CA" },
  "945": { lat: 37.8, lng: -122.27, label: "Oakland, CA" },
  "948": { lat: 37.39, lng: -122.08, label: "Palo Alto, CA" },
  "951": { lat: 36.97, lng: -121.98, label: "Santa Cruz, CA" },
  "956": { lat: 38.58, lng: -121.49, label: "Sacramento, CA" },
  "970": { lat: 45.52, lng: -122.68, label: "Portland, OR" },
  "973": { lat: 44.05, lng: -123.09, label: "Eugene, OR" },
  "980": { lat: 47.61, lng: -122.33, label: "Seattle, WA" },
  "981": { lat: 47.25, lng: -122.44, label: "Tacoma, WA" },
  "990": { lat: 47.66, lng: -117.43, label: "Spokane, WA" },
};

const ZIP3_KEYS = Object.keys(ZIP3_CENTROIDS).sort();

/** Best-effort geocode of a US ZIP code to an approximate lat/lng. */
export function geocodeZip(zip: string): { lat: number; lng: number; label: string } | null {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  if (digits.length < 3) return null;
  const prefix = digits.slice(0, 3);

  if (ZIP3_CENTROIDS[prefix]) return ZIP3_CENTROIDS[prefix];

  // Fall back to the nearest known prefix numerically — ZIP codes are
  // assigned roughly geographically west-to-east, so this keeps unlisted
  // prefixes in the right general region rather than failing outright.
  const target = Number(prefix);
  let closest = ZIP3_KEYS[0];
  let closestDiff = Infinity;
  for (const key of ZIP3_KEYS) {
    const diff = Math.abs(Number(key) - target);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = key;
    }
  }
  return ZIP3_CENTROIDS[closest] ?? null;
}

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
