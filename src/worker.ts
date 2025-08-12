// src/worker.ts
// Stub sin Redis para Render: no crea conexiones ni colas reales.

export async function enqueueInactivity(leadId: string, seconds: number) {
  console.log(
    `[Stub Worker] Programar inactividad para lead ${leadId} en ${seconds} segundos (sin Redis)`
  );
  // Aquí no hacemos nada porque Redis no está disponible en Render free.
}
