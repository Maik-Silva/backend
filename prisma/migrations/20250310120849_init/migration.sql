-- CreateTable
CREATE TABLE `Alimentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `Alimento` VARCHAR(191) NOT NULL,
    `Quantidade (g)` INTEGER NOT NULL,
    `Energia (Kcal)` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
