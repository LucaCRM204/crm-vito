/*
  Warnings:

  - You are about to drop the `Tarea` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Tarea" DROP CONSTRAINT "Tarea_leadId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Tarea" DROP CONSTRAINT "Tarea_vendedorId_fkey";

-- DropTable
DROP TABLE "public"."Tarea";

-- DropEnum
DROP TYPE "public"."TareaEstado";
