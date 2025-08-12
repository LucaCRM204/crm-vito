import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { guardarLeadEnSheet, obtenerLeads } from './sheets';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Configuración del puerto
const PORT = process.env.PORT || 3000;

// Configuración de vistas
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// -------- Rutas base para evitar 502 en Render --------

// Ruta de salud para Render
app.get('/ping', (_req, res) => res.send('pong'));

// Redirigir la raíz al panel de leads
app.get('/', (_req, res) => res.redirect('/app/leads'));

// -------- API REST --------

// Obtener todos los leads
app.get('/leads', async (_req, res) => {
  try {
    const leads = await obtenerLeads();
    res.json(leads);
  } catch (error) {
    console.error('Error al obtener leads:', error);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// Guardar un nuevo lead
app.post('/leads', async (req, res) => {
  try {
    const { nombre, telefono, modelo, marca, formaPago, infoUsado } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }

    await guardarLeadEnSheet({ nombre, telefono, modelo, marca, formaPago, infoUsado });
    res.json({ message: 'Lead guardado correctamente' });
  } catch (error) {
    console.error('Error al guardar lead:', error);
    res.status(500).json({ error: 'Error al guardar lead' });
  }
});

// -------- Vistas HTML --------

// Vista lista de leads
app.get('/app/leads', async (_req, res) => {
  try {
    const leads = await obtenerLeads();
    res.render('leads_list', { leads });
  } catch (error) {
    console.error('Error al renderizar lista de leads:', error);
    res.status(500).send('Error al cargar la vista de leads');
  }
});

// ------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
