-- WhatsApp session stored in the database (instead of the auth_info_baileys folder)
CREATE TABLE "WhatsAppAuth" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAuth_pkey" PRIMARY KEY ("id")
);
