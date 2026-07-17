const STATE_LOOKUP = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN',
  'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA',
  'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI',
  'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
  'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
  'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY'
};

function autoDetectLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng, {
        headers: { 'Accept-Language': 'en' }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.address) return;
          var stateName = data.address.state;
          if (!stateName) return;
          var abbr = STATE_LOOKUP[stateName];
          if (!abbr) return;

          localStorage.setItem(LOCALSTORAGE_LOCATION, abbr);
          document.body.dataset.location = abbr;

          var select = document.getElementById('setLocation');
          if (select) {
            select.value = abbr;
          }
        })
        .catch(function () { /* geocode failed — leave unset */ });
    },
    function () { /* geolocation denied or unavailable — leave unset */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  );
}

document.addEventListener('DOMContentLoaded', autoDetectLocation);
