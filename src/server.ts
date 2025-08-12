import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { prisma } from './prisma';
import { pickSupervisorByRotation, autoAssignVendor } from './assign';
import { enqueueInactivity } from './worker';

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true })); // ⬅️ para procesar formularios

// --- VISTAS (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const ESTADOS = [
  'NUEVO',
  'DERIVADO_SUP',
  'ASIGNADO_VEND',
  'EN_PROCESO',
  'INCOMPLETO',
  'GANADO',
  'PERDIDO',
] as const;

// ---------- API (sigue igual) ----------
app.post('/webhook', async (req, res) => {
  try {
    const { telefono, nombre, marca, modelo, formaPago, infoUsado, mensaje } = req.body || {};
    if (!telefono) return res.status(400).json({ error: 'telefono es requerido' });

    const existing = await prisma.lead.findUnique({ where: { telefono } });

    const patch = {
      nombre: nombre ?? existing?.nombre ?? null,
      marca: marca ?? existing?.marca ?? null,
      modelo: modelo ?? existing?.modelo ?? null,
      formaPago: formaPago ?? existing?.formaPago ?? null,
      infoUsado: infoUsado ?? existing?.infoUsado ?? null,
    };

    const lead = await prisma.lead.upsert({
      where: { telefono },
      create: { telefono, ...patch, lastMsgAt: new Date() },
      update: { ...patch, lastMsgAt: new Date() },
    });

    if (mensaje) {
      await prisma.message.create({ data: { leadId: lead.id, fromBot: false, text: mensaje } });
    }

    const responded = !!(patch.nombre || patch.modelo || patch.formaPago || patch.infoUsado);

    if (lead.estado === 'NUEVO' && responded) {
      const sup = await pickSupervisorByRotation();
      if (sup) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { estado: 'DERIVADO_SUP', supervisorId: sup.id },
        });
        if ((process.env.ASSIGNMENT_MODE || 'auto') !== 'manual') {
          await autoAssignVendor(lead.id);
        }
      }
    }

    await enqueueInactivity(lead.id, Number(process.env.INACTIVITY_SECONDS || 21600));
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'server error' });
  }
});

app.get('/leads', async (_req, res) => {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { supervisor: true, vendedor: true },
  });
  res.json(leads);
});

// ---------- UI: LISTA DE LEADS ----------
app.get('/app', (_req, res) => res.redirect('/app/leads'));

app.get('/app/leads', async (req, res) => {
  const q = (req.query.q as string)?.trim()?.toLowerCase() || '';

  const leads = await prisma.lead.findMany({
    where: q
      ? {
          OR: [
            { telefono: { contains: q } },
            { nombre: { contains: q, mode: 'insensitive' } },
            { marca: { contains: q, mode: 'insensitive' } },
            { modelo: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { supervisor: true, vendedor: true },
  });

  res.render('leads_list', { leads, q, estados: ESTADOS });
});

// ---------- UI: DETALLE DEL LEAD ----------
app.get('/app/leads/:id', async (req, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      supervisor: true,
      vendedor: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  });
  if (!lead) return res.status(404).send('Lead no encontrado');
  res.render('lead_detail', { lead, estados: ESTADOS });
});

// Cambiar estado
app.post('/app/leads/:id/estado', async (req, res) => {
  const estado = (req.body.estado as string) || '';
  if (!ESTADOS.includes(estado as any)) {
    return res.status(400).send('Estado inválido');
  }
  await prisma.lead.update({ where: { id: req.params.id }, data: { estado: estado as any } });
  res.redirect(`/app/leads/${req.params.id}`);
});

// Agregar nota interna (se guarda en Message como fromBot=true)
app.post('/app/leads/:id/nota', async (req, res) => {
  const text = (req.body.text as string)?.trim();
  if (text) {
    await prisma.message.create({
      data: { leadId: req.params.id, fromBot: true, text },
    });
  }
  res.redirect(`/app/leads/${req.params.id}`);
});

app.listen(process.env.PORT || 3001, () => console.log('CRM VITO listo (auto-assign + 6h)'));
