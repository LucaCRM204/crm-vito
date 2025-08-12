import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import dotenv from 'dotenv';
import { prisma } from './prisma';
import { pickSupervisorByRotation, autoAssignVendor } from './assign';
import { enqueueInactivity } from './worker'; // stub sin Redis

dotenv.config();

const app = express();

// Middlewares
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Vistas (EJS) -> se copian a dist/views en el postbuild
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- RUTAS BASE ---
app.get('/ping', (_req, res) => res.send('pong'));
app.get('/', (_req, res) => res.redirect('/app/leads'));

// Estados válidos
const ESTADOS = [
  'NUEVO',
  'DERIVADO_SUP',
  'ASIGNADO_VEND',
  'EN_PROCESO',
  'INCOMPLETO',
  'GANADO',
  'PERDIDO',
] as const;

// ---------- API ----------
app.post('/webhook', async (req: Request, res: Response) => {
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

app.get('/leads', async (_req: Request, res: Response) => {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { supervisor: true, vendedor: true },
  });
  res.json(leads);
});

// ---------- UI ----------
app.get('/app', (_req: Request, res: Response) => res.redirect('/app/leads'));

app.get('/app/leads', async (req: Request, res: Response) => {
  const q = (req.query.q as string)?.trim()?.toLowerCase() || '';
  const where = q
    ? {
        OR: [
          { telefono: { contains: q } },
          { nombre: { contains: q, mode: 'insensitive' } },
          { marca: { contains: q, mode: 'insensitive' } },
          { modelo: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { supervisor: true, vendedor: true },
  });

  res.render('leads_list', { leads, q, estados: ESTADOS });
});

app.get('/app/leads/:id', async (req: Request, res: Response) => {
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

app.post('/app/leads/:id/estado', async (req: Request, res: Response) => {
  const estado = (req.body.estado as string) || '';
  if (!ESTADOS.includes(estado as any)) {
    return res.status(400).send('Estado inválido');
  }
  await prisma.lead.update({ where: { id: req.params.id }, data: { estado: estado as any } });
  res.redirect(`/app/leads/${req.params.id}`);
});

app.post('/app/leads/:id/nota', async (req: Request, res: Response) => {
  const text = (req.body.text as string)?.trim();
  if (text) {
    await prisma.message.create({
      data: { leadId: req.params.id, fromBot: true, text },
    });
  }
  res.redirect(`/app/leads/${req.params.id}`);
});

// Puerto
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => console.log(`CRM VITO listo en ${PORT} (auto-assign + 6h)`));

export default app;
