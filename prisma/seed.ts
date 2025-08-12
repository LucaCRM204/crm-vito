import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Hashear contraseña por defecto
  const passwordHash = await bcrypt.hash('123456', 10);

  // Crear gerente
  const gerente = await prisma.user.create({
    data: {
      email: 'gerente@vito.com',
      nombre: 'Gerente VITO',
      password: passwordHash,
      role: Role.GERENTE
    }
  });

  console.log('✅ Gerente creado:', gerente.email);

  // Marcas
  const marcas = ['Volkswagen', 'Fiat', 'Peugeot', 'Renault'];

  // Crear supervisores (1 por marca)
  const supervisores = [];
  for (const marca of marcas) {
    const sup = await prisma.user.create({
      data: {
        email: `sup_${marca.toLowerCase()}@vito.com`,
        nombre: `Supervisor ${marca}`,
        password: passwordHash,
        role: Role.SUPERVISOR
      }
    });
    supervisores.push(sup);
    console.log(`✅ Supervisor creado para ${marca}:`, sup.email);
  }

  // Crear 50 vendedores repartidos entre supervisores
  let vendedorCount = 1;
  for (const supervisor of supervisores) {
    for (let i = 0; i < 50 / supervisores.length; i++) {
      await prisma.user.create({
        data: {
          email: `vendedor${vendedorCount}@vito.com`,
          nombre: `Vendedor ${vendedorCount}`,
          password: passwordHash,
          role: Role.VENDEDOR,
          supervisorId: supervisor.id
        }
      });
      vendedorCount++;
    }
  }

  console.log('✅ 50 vendedores creados y asignados a supervisores.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
