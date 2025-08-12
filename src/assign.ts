import { prisma } from './prisma';

export async function pickSupervisorByRotation() {
  const sups = await prisma.user.findMany({ where: { role: 'SUPERVISOR', activo: true }, orderBy: { createdAt: 'asc' } });
  if (!sups.length) return null;

  const rot = await prisma.rotation.upsert({
    where: { id: 'supervisor-rotation' },
    create: { id: 'supervisor-rotation', index: 0 },
    update: {}
  });

  const chosen = sups[rot.index % sups.length];
  await prisma.rotation.update({ where: { id: 'supervisor-rotation' }, data: { index: rot.index + 1 } });
  return chosen;
}

export async function autoAssignVendor(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.supervisorId) return;

  const vendedores = await prisma.user.findMany({
    where: { role: 'VENDEDOR', supervisorId: lead.supervisorId, activo: true },
    orderBy: { createdAt: 'asc' }
  });
  if (!vendedores.length) return;

  const rotKey = `sup:${lead.supervisorId}`;
  const rot = await prisma.rotation.upsert({
    where: { id: rotKey },
    create: { id: rotKey, index: 0 },
    update: {}
  });

  const max = Number(process.env.MAX_ACTIVOS_POR_VENDEDOR || 9999);
  const cargas = await Promise.all(vendedores.map(async v => ({
    v,
    activos: await prisma.lead.count({ where: { vendedorId: v.id, estado: { in: ['ASIGNADO_VEND', 'EN_PROCESO'] } } })
  })));
  const pool = cargas.filter(c => c.activos < max).map(c => c.v);
  const lista = pool.length ? pool : vendedores;

  const elegido = lista[rot.index % lista.length];
  await prisma.rotation.update({ where: { id: rotKey }, data: { index: rot.index + 1 } });

  await prisma.lead.update({ where: { id: lead.id }, data: { vendedorId: elegido.id, estado: 'ASIGNADO_VEND' } });
}



