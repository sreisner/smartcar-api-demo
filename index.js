const express = require('express');
const bodyParser = require('body-parser');
const smartcar = require('smartcar');
const uuidv1 = require('uuid/v1');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const client = new smartcar.AuthClient({
  clientId: process.env.SMARTCAR_CLIENT_ID,
  clientSecret: process.env.SMARTCAR_SECRET,
  redirectUri: process.env.SMARTCAR_REDIRECT_URI,
  scope: ['read_odometer', 'read_vehicle_info'],
  development: true
});

const app = express();
app.use(bodyParser.json());

const pendingOilChanges = [];

app.post('/register', (req, res) => {
  const { phoneNumber, mileage } = req.body;

  const id = uuidv1();
  pendingOilChanges.push({
    id,
    phoneNumber,
    mileage,
    accessToken: null
  });

  const link = client.getAuthUrl({ state: id });

  res.redirect(link);
});

app.get('/callback', (req, res) => {
  return client
    .exchangeCode(req.query.code)
    .then(access => {
      const pendingOilChange = pendingOilChanges.find(
        p => p.id === req.query.state
      );
      pendingOilChange.accessToken = access.accessToken;
    })
    .then(() => res.redirect('/success'));
});

app.get('/success', (req, res) => {
  res.send('<h1>Success!</h1>');
});

app.post('/send-texts', async (req, res) => {
  for (const pendingOilChange of pendingOilChanges) {
    if (pendingOilChange.accessToken) {
      const vehicleIds = await smartcar.getVehicleIds(pendingOilChange.accessToken);
      const vehicle = new smartcar.Vehicle(vehicleIds.vehicles[0], pendingOilChange.accessToken);
      const info = await vehicle.info();
      const odometer = await vehicle.odometer();

      if (odometer.data.distance >= pendingOilChange.mileage) {
        const textMessage = `
          Hi!  Looks like your ${info.year} ${info.make} ${info.model} was due for an
          oil change at ${pendingOilChange.mileage} miles.  Schedule one with Car-X today!
        `;

        console.log(textMessage);
      }
    }
  }

  res.status(204).end();
});

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
