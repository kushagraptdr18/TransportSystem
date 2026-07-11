-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "LedgerGroup" AS ENUM ('BANK', 'CASH', 'CONSIGNEE_CONSIGNOR', 'DRIVER', 'EXPENSE', 'INCOME', 'OFFICE', 'OWNER_BROKER', 'STAFF', 'SUPPLIERS');

-- CreateEnum
CREATE TYPE "LrType" AS ENUM ('TO_PAY', 'TBB', 'PAID', 'FOC', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LrStatus" AS ENUM ('PENDING', 'ON_CHALAN', 'ARRIVED', 'DELIVERED', 'BILLED');

-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('QTY', 'ACTUAL_WT', 'CHARGE_WT', 'FIXED');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('RECEIPT', 'PAYMENT', 'CONTRA');

-- CreateEnum
CREATE TYPE "VoucherEntryType" AS ENUM ('CASH', 'BANK', 'CONTRA');

-- CreateEnum
CREATE TYPE "ModuleLink" AS ENUM ('BILLING', 'LORRY_HIRE', 'BROKER_ENTRY', 'FREIGHT_CHALLAN', 'CASH_MEMO', 'GST_BILLING', 'LR_ENTRY', 'OTHERS');

-- CreateEnum
CREATE TYPE "AdvanceType" AS ENUM ('CASH', 'BANK', 'DIESEL', 'TOLL', 'TYRE', 'SPARE_PARTS', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "PodSourceType" AS ENUM ('BOOKING', 'OUTWARD_CROSSING', 'CROSSING_CHALLAN', 'GATE_PASS', 'BROKER_SLIP');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('GATE_PASS', 'CASH_MEMO');

-- CreateEnum
CREATE TYPE "CashCredit" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "LoadingChalanType" AS ENUM ('DIRECT', 'CROSSING');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('PART_TRUCK', 'FULL_TRUCK', 'MANUAL', 'GST');

-- CreateEnum
CREATE TYPE "TdsMode" AS ENUM ('TDS_APPLICABLE', 'DECLARATION');

-- CreateEnum
CREATE TYPE "TripLeg" AS ENUM ('GOING', 'RETURN');

-- CreateEnum
CREATE TYPE "EntrySide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "DocNumberType" AS ENUM ('LR', 'CHALAN', 'LOADING_CHALAN', 'ARRIVAL', 'DELIVERY', 'CROSSING', 'OUTWARD_CROSSING', 'HIRE_SLIP', 'SUMMARY', 'VOUCHER_RECEIPT', 'VOUCHER_PAYMENT', 'VOUCHER_CONTRA', 'POD', 'BROKER_SLIP', 'BROKER_BILL', 'TRIP', 'JOB_ENTRY', 'PURCHASE', 'CASH_REPORT');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "stateId" TEXT,
    "cityId" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "msmeNo" TEXT,
    "jurisdiction" TEXT,
    "cgstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankBranch" TEXT,
    "bankIfsc" TEXT,
    "logoPath" TEXT,
    "sealPath" TEXT,
    "smtpHost" TEXT,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "defaultBankPartyId" TEXT,
    "defaultTdsPct" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "signaturePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFirm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,

    CONSTRAINT "UserFirm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canPrint" BOOLEAN NOT NULL DEFAULT true,
    "canExport" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "docType" "DocNumberType" NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    "prefix" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstCode" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT,
    "pincode" TEXT,
    "stdCode" TEXT,
    "officeType" TEXT,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ledgerGroup" "LedgerGroup" NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "stateId" TEXT,
    "cityId" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "aadhar" TEXT,
    "iecNo" TEXT,
    "rcNo" TEXT,
    "licenseNo" TEXT,
    "ownerName" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "arnNo" TEXT,
    "vendorCode" TEXT,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingSide" "EntrySide" NOT NULL DEFAULT 'DEBIT',
    "tdsMode" "TdsMode",
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankBranch" TEXT,
    "bankIfsc" TEXT,
    "panDocPath" TEXT,
    "declarationDocPath" TEXT,
    "aadharDocPath" TEXT,
    "gstDocPath" TEXT,
    "photoPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountHead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "AccountHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "type" TEXT,
    "hsnCode" TEXT,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "className" TEXT,
    "division" TEXT,
    "leadTime" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL DEFAULT 1,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "ownerId" TEXT,
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "chassisNo" TEXT,
    "engineNo" TEXT,
    "vehicleType" TEXT,
    "permitNo" TEXT,
    "insuranceNo" TEXT,
    "rcDocPath" TEXT,
    "fitnessDocPath" TEXT,
    "insuranceDocPath" TEXT,
    "permitDocPath" TEXT,
    "stateTaxDocPath" TEXT,
    "pucDocPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateMaster" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "productId" TEXT,
    "sourceCityId" TEXT NOT NULL,
    "destCityId" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT',
    "hamali" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hamaliBasis" "RateBasis" NOT NULL DEFAULT 'FIXED',
    "preBhada" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "preBhadaBasis" "RateBasis" NOT NULL DEFAULT 'FIXED',
    "dCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dChargeBasis" "RateBasis" NOT NULL DEFAULT 'FIXED',
    "stationery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stationeryBasis" "RateBasis" NOT NULL DEFAULT 'FIXED',
    "crossing" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "crossingBasis" "RateBasis" NOT NULL DEFAULT 'FIXED',

    CONSTRAINT "RateMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "showReminder" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docNo" TEXT,
    "docTypeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "companyName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobHead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "hsnCode" TEXT,
    "description" TEXT,
    "showReminder" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lr" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "lrNo" TEXT NOT NULL,
    "lrDate" TIMESTAMP(3) NOT NULL,
    "refLrNo" TEXT,
    "privateMarka" TEXT,
    "isDummy" BOOLEAN NOT NULL DEFAULT false,
    "sourceCityId" TEXT NOT NULL,
    "destCityId" TEXT NOT NULL,
    "consignorId" TEXT NOT NULL,
    "consigneeId" TEXT NOT NULL,
    "billToId" TEXT,
    "vehicleId" TEXT,
    "vehicleText" TEXT,
    "ownerName" TEXT,
    "deliveryAt" TEXT,
    "transpMode" TEXT,
    "remarks" TEXT,
    "lrType" "LrType" NOT NULL DEFAULT 'TBB',
    "status" "LrStatus" NOT NULL DEFAULT 'PENDING',
    "printFreight" BOOLEAN NOT NULL DEFAULT true,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "insCompany" TEXT,
    "insPolicyNo" TEXT,
    "insAmount" DECIMAL(14,2),
    "invoiceNo" TEXT,
    "obdNo" TEXT,
    "refNo" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "goodsValue" DECIMAL(14,2),
    "ewayBillNo" TEXT,
    "ewayExpiry" TIMESTAMP(3),
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hamali" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "preBhada" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "biltyCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceBank" TEXT,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "poNumber" TEXT,
    "gateEntryNo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LrItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lrId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actualWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "chargeWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'MT',
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT',
    "recWt" DECIMAL(12,3),
    "shortageWt" DECIMAL(12,3),
    "shortageRate" DECIMAL(12,2),
    "shortageAmt" DECIMAL(12,2),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "length" DECIMAL(10,2),
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),

    CONSTRAINT "LrItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chalan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "chalanNo" TEXT NOT NULL,
    "chalanDate" TIMESTAMP(3) NOT NULL,
    "brokerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverName" TEXT,
    "driverMobile" TEXT,
    "licenseNo" TEXT,
    "payableAt" TEXT,
    "sourceCityId" TEXT,
    "destCityId" TEXT,
    "remarks" TEXT,
    "actualWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "chargeWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT',
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bookingFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "detention" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "odcAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fineSlip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ldCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shortageAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mamool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "courierCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "commissionAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherRemarks" TEXT,
    "totalChalanAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startKm" DECIMAL(12,1),
    "unloadDate" TIMESTAMP(3),
    "unloadKm" DECIMAL(12,1),
    "runningKm" DECIMAL(12,1),
    "tripDays" INTEGER,
    "unloadRemarks" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chalan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChalanLr" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chalanId" TEXT NOT NULL,
    "lrId" TEXT NOT NULL,

    CONSTRAINT "ChalanLr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChalanAdvance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chalanId" TEXT NOT NULL,
    "type" "AdvanceType" NOT NULL,
    "supplierName" TEXT,
    "bankName" TEXT,
    "dieselQty" DECIMAL(12,3),
    "dieselRate" DECIMAL(12,2),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "ChalanAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingChalan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "chalanNo" TEXT NOT NULL,
    "chalanDate" TIMESTAMP(3) NOT NULL,
    "type" "LoadingChalanType" NOT NULL DEFAULT 'DIRECT',
    "vehicleId" TEXT,
    "driverName" TEXT,
    "driverMobile" TEXT,
    "licenseNo" TEXT,
    "vehicleOwner" TEXT,
    "brokerId" TEXT,
    "sourceCityId" TEXT,
    "destCityId" TEXT,
    "remarks" TEXT,
    "lrIds" JSONB,
    "totFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "truckFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lcCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dcCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cfCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totCrossing" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LoadingChalan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arrival" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "arrivalNo" TEXT NOT NULL,
    "unloadDate" TIMESTAMP(3) NOT NULL,
    "unloadedBy" TEXT,
    "godownNo" TEXT,
    "manifestNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "delNo" TEXT NOT NULL,
    "delDate" TIMESTAMP(3) NOT NULL,
    "type" "DeliveryType" NOT NULL DEFAULT 'GATE_PASS',
    "partyId" TEXT,
    "vehicleId" TEXT,
    "lrNo" TEXT,
    "grNo" TEXT,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "totWeight" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ewayBillNo" TEXT,
    "deliveryPerson" TEXT,
    "through" TEXT,
    "payType" "LrType" NOT NULL DEFAULT 'TO_PAY',
    "cashType" "CashCredit" NOT NULL DEFAULT 'CASH',
    "deliveryCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gatepassCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "labourCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aoc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "damrage" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crossing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "chalanNo" TEXT NOT NULL,
    "chalanDate" TIMESTAMP(3) NOT NULL,
    "transporterId" TEXT,
    "vehicleId" TEXT,
    "driverName" TEXT,
    "licenseNo" TEXT,
    "consigneeId" TEXT,
    "lrNo" TEXT,
    "grNo" TEXT,
    "sourceCityId" TEXT,
    "addressTo" TEXT,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ewayBillNo" TEXT,
    "payType" "LrType" NOT NULL DEFAULT 'TO_PAY',
    "crossingAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dcPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "dcAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "toPayAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tbbAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partA" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "drCr" "EntrySide" NOT NULL DEFAULT 'DEBIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Crossing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutwardCrossing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "ocNo" TEXT NOT NULL,
    "chalanDate" TIMESTAMP(3) NOT NULL,
    "arrivalNo" TEXT,
    "arrivalDate" TIMESTAMP(3),
    "vehicleId" TEXT,
    "transporterId" TEXT,
    "sourceCityId" TEXT,
    "destCityId" TEXT,
    "lrType" "LrType" NOT NULL DEFAULT 'TO_PAY',
    "unit" TEXT,
    "remarks" TEXT,
    "lines" JSONB NOT NULL,
    "totalQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "totalWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "totFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "crossingFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OutwardCrossing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HireSlip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "slipNo" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT,
    "ownerName" TEXT,
    "ownerPan" TEXT,
    "brokerName" TEXT,
    "driverName" TEXT,
    "driverMobile" TEXT,
    "licenseNo" TEXT,
    "product" TEXT,
    "form15" TEXT,
    "via" TEXT,
    "payableAt" TEXT,
    "chalanNo" TEXT,
    "sourceCityId" TEXT,
    "destCityId" TEXT,
    "totalPkgs" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actualWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "guaranteeWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ratePmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lorryHire" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loadingH" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "craneCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unloadingH" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overHeightCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "others" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lessTds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lessSc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalHire" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HireSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "summaryNo" TEXT NOT NULL,
    "summaryDate" TIMESTAMP(3) NOT NULL,
    "chalanNo" TEXT,
    "chalanDate" TIMESTAMP(3),
    "vehicleId" TEXT,
    "sourceCityId" TEXT,
    "destCityId" TEXT,
    "remarks" TEXT,
    "deliveryAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "crossingAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delCommPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "delCommAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "crossingFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "truckFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unloadCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "doorDelivery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extraLines" JSONB,
    "totPartA" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totPartB" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SettlementSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "partyId" TEXT NOT NULL,
    "lrTypeFilter" "LrType",
    "remarks" TEXT,
    "subject" TEXT,
    "bankPartyId" TEXT,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "cgstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "tdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "placeOfSupply" TEXT,
    "supplyDate" TIMESTAMP(3),
    "transportMode" TEXT,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "tcsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tcsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freightExtra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "othersExtra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "vehicleText" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLr" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lrId" TEXT NOT NULL,

    CONSTRAINT "InvoiceLr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "relatedLrs" TEXT,
    "remarks" TEXT,

    CONSTRAINT "InvoiceCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "uom" TEXT,
    "hsnCode" TEXT,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "billNo" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT,
    "receivedBy" TEXT,
    "deptName" TEXT,
    "submittedBy" TEXT,
    "docketNo" TEXT,
    "counterName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL,
    "type" "VoucherType" NOT NULL,
    "entryType" "VoucherEntryType" NOT NULL DEFAULT 'CASH',
    "moduleLink" "ModuleLink" NOT NULL DEFAULT 'OTHERS',
    "partyId" TEXT,
    "vehicleId" TEXT,
    "accountHeadId" TEXT,
    "ledgerPosting" TEXT NOT NULL DEFAULT 'PARTY',
    "bankPartyId" TEXT,
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "biltyNo" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "refType" "ModuleLink" NOT NULL,
    "refId" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "billAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "VoucherAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT,
    "vehicleId" TEXT,
    "accountHeadId" TEXT,
    "side" "EntrySide" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "docDate" TIMESTAMP(3) NOT NULL,
    "sourceType" "PodSourceType" NOT NULL DEFAULT 'BOOKING',
    "lrId" TEXT,
    "refNo" TEXT,
    "vehicleId" TEXT,
    "unloadDate" TIMESTAMP(3),
    "ackNo" TEXT,
    "actualWt" DECIMAL(12,3),
    "recWt" DECIMAL(12,3),
    "shortageWt" DECIMAL(12,3),
    "poNumber" TEXT,
    "gateEntryNo" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerSlip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "slipNo" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT,
    "transporterId" TEXT,
    "loadStationId" TEXT,
    "destCityId" TEXT,
    "consignorId" TEXT,
    "consigneeId" TEXT,
    "lrNo" TEXT,
    "lrDate" TIMESTAMP(3),
    "ewbNo" TEXT,
    "ewbDate" TIMESTAMP(3),
    "productId" TEXT,
    "productName" TEXT,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actualWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "chargeWt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "rateBasis" "RateBasis" NOT NULL DEFAULT 'CHARGE_WT',
    "partyId" TEXT,
    "pRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pDetention" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pOdcAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pFineSlip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pLdCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pShortageAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pTdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pTdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pCommPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pCommAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pMamool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pPaymentCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pChalanAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pNetAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pAdvance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pRemarks" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "vRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vDetention" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vOdcAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vFineAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vLdCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vShortageAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vTdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vTdsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vCommPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vCommAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vMamool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vPaymentAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vChalanAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vNetAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vAdvance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vRemarks" TEXT,
    "advances" JSONB,
    "startKm" DECIMAL(12,1),
    "unloadDate" TIMESTAMP(3),
    "unloadKm" DECIMAL(12,1),
    "runningKm" DECIMAL(12,1),
    "tripDays" INTEGER,
    "unloadRemarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BrokerSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "tripNo" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "vehicleId" TEXT NOT NULL,
    "vehicleType" TEXT,
    "goingPartyId" TEXT,
    "goingSourceCityId" TEXT,
    "goingDestCityId" TEXT,
    "gFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gHamali" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gOthers" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gTotalFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gDiesel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gDriverAdvance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gPartyAdvance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gOther" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gBankName" TEXT,
    "gBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gRemarks" TEXT,
    "returnPartyId" TEXT,
    "returnSourceCityId" TEXT,
    "returnDestCityId" TEXT,
    "rFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rHamali" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rOthers" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rTotalFreight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rDiesel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rDriverAdvance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rPartyAdvance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rDetention" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rBankName" TEXT,
    "rBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "date" TIMESTAMP(3),

    CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInfo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "garageId" TEXT,
    "jobDescription" TEXT,
    "jobCompDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "refNo" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "billType" TEXT NOT NULL DEFAULT 'INVOICE',
    "invType" "CashCredit" NOT NULL DEFAULT 'CREDIT',
    "supplierId" TEXT,
    "vehicleId" TEXT,
    "attenderName" TEXT,
    "attenderMobile" TEXT,
    "challanNo" TEXT,
    "challanDate" TIMESTAMP(3),
    "lines" JSONB NOT NULL,
    "currKm" DECIMAL(12,1),
    "kmInterval" DECIMAL(12,1),
    "daysInterval" INTEGER,
    "remindType" TEXT,
    "dueDate" TIMESTAMP(3),
    "totTaxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totCgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totSgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totIgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "others" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tcsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tcsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PURCHASE',
    "invoiceNo" TEXT NOT NULL,
    "refNo" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "billType" TEXT NOT NULL DEFAULT 'INVOICE',
    "invType" "CashCredit" NOT NULL DEFAULT 'CREDIT',
    "buyerId" TEXT,
    "consigneeId" TEXT,
    "transportId" TEXT,
    "agentId" TEXT,
    "transMode" TEXT,
    "supplyDate" TIMESTAMP(3),
    "supplyPlace" TEXT,
    "supplyType" TEXT NOT NULL DEFAULT 'INVOICE',
    "challanNo" TEXT,
    "challanDate" TIMESTAMP(3),
    "orderNo" TEXT,
    "orderDate" TIMESTAMP(3),
    "vehicleId" TEXT,
    "driverId" TEXT,
    "lines" JSONB NOT NULL,
    "opngKm" DECIMAL(12,1),
    "currKm" DECIMAL(12,1),
    "clsngKm" DECIMAL(12,1),
    "wrntyDate" TIMESTAMP(3),
    "wrntyDays" INTEGER,
    "totTaxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totCgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totSgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totIgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "others" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tcsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tcsAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TyreInstallation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "productGroupId" TEXT,
    "productId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "position" TEXT,
    "partNo" TEXT,
    "instKm" DECIMAL(12,1),
    "uninstKm" DECIMAL(12,1),
    "instDate" TIMESTAMP(3),
    "uninstDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TyreInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productGroupId" TEXT,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partNo" TEXT,
    "wrntyExpDate" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "OpeningStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bookNo" TEXT,
    "fromNo" INTEGER,
    "toNo" INTEGER,
    "issuedTo" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationeryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lrId" TEXT,
    "lrNo" TEXT,
    "grNo" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Firm_tenantId_idx" ON "Firm"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialYear_tenantId_idx" ON "FinancialYear"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_firmId_label_key" ON "FinancialYear"("firmId", "label");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "UserFirm_userId_firmId_key" ON "UserFirm"("userId", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_module_key" ON "UserPermission"("userId", "module");

-- CreateIndex
CREATE INDEX "DocumentSequence_tenantId_idx" ON "DocumentSequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_firmId_fyId_docType_key" ON "DocumentSequence"("firmId", "fyId", "docType");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "State_tenantId_idx" ON "State"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "State_tenantId_name_key" ON "State"("tenantId", "name");

-- CreateIndex
CREATE INDEX "City_tenantId_idx" ON "City"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "City_tenantId_name_stateId_key" ON "City"("tenantId", "name", "stateId");

-- CreateIndex
CREATE INDEX "Party_tenantId_ledgerGroup_idx" ON "Party"("tenantId", "ledgerGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Party_tenantId_name_ledgerGroup_key" ON "Party"("tenantId", "name", "ledgerGroup");

-- CreateIndex
CREATE INDEX "AccountHead_tenantId_idx" ON "AccountHead"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHead_tenantId_name_key" ON "AccountHead"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ProductGroup_tenantId_idx" ON "ProductGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_tenantId_name_key" ON "ProductGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_name_key" ON "Product"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Unit_tenantId_idx" ON "Unit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_tenantId_name_key" ON "Unit"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_number_key" ON "Vehicle"("tenantId", "number");

-- CreateIndex
CREATE INDEX "RateMaster_tenantId_idx" ON "RateMaster"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RateMaster_tenantId_partyId_productId_sourceCityId_destCity_key" ON "RateMaster"("tenantId", "partyId", "productId", "sourceCityId", "destCityId");

-- CreateIndex
CREATE INDEX "DocumentType_tenantId_idx" ON "DocumentType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_tenantId_name_key" ON "DocumentType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "VehicleDocument_tenantId_expiryDate_idx" ON "VehicleDocument"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "JobHead_tenantId_idx" ON "JobHead"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "JobHead_tenantId_name_key" ON "JobHead"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Lr_tenantId_firmId_fyId_status_idx" ON "Lr"("tenantId", "firmId", "fyId", "status");

-- CreateIndex
CREATE INDEX "Lr_tenantId_vehicleId_status_idx" ON "Lr"("tenantId", "vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Lr_firmId_fyId_lrNo_key" ON "Lr"("firmId", "fyId", "lrNo");

-- CreateIndex
CREATE INDEX "LrItem_tenantId_idx" ON "LrItem"("tenantId");

-- CreateIndex
CREATE INDEX "Chalan_tenantId_firmId_fyId_idx" ON "Chalan"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE INDEX "Chalan_tenantId_vehicleId_idx" ON "Chalan"("tenantId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Chalan_firmId_fyId_chalanNo_key" ON "Chalan"("firmId", "fyId", "chalanNo");

-- CreateIndex
CREATE INDEX "ChalanLr_tenantId_lrId_idx" ON "ChalanLr"("tenantId", "lrId");

-- CreateIndex
CREATE UNIQUE INDEX "ChalanLr_chalanId_lrId_key" ON "ChalanLr"("chalanId", "lrId");

-- CreateIndex
CREATE INDEX "ChalanAdvance_tenantId_idx" ON "ChalanAdvance"("tenantId");

-- CreateIndex
CREATE INDEX "LoadingChalan_tenantId_firmId_fyId_idx" ON "LoadingChalan"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadingChalan_firmId_fyId_chalanNo_key" ON "LoadingChalan"("firmId", "fyId", "chalanNo");

-- CreateIndex
CREATE INDEX "Arrival_tenantId_idx" ON "Arrival"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Arrival_firmId_fyId_arrivalNo_key" ON "Arrival"("firmId", "fyId", "arrivalNo");

-- CreateIndex
CREATE INDEX "Delivery_tenantId_firmId_fyId_idx" ON "Delivery"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_firmId_fyId_delNo_key" ON "Delivery"("firmId", "fyId", "delNo");

-- CreateIndex
CREATE INDEX "Crossing_tenantId_firmId_fyId_idx" ON "Crossing"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "Crossing_firmId_fyId_chalanNo_key" ON "Crossing"("firmId", "fyId", "chalanNo");

-- CreateIndex
CREATE INDEX "OutwardCrossing_tenantId_firmId_fyId_idx" ON "OutwardCrossing"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "OutwardCrossing_firmId_fyId_ocNo_key" ON "OutwardCrossing"("firmId", "fyId", "ocNo");

-- CreateIndex
CREATE INDEX "HireSlip_tenantId_firmId_fyId_idx" ON "HireSlip"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "HireSlip_firmId_fyId_slipNo_key" ON "HireSlip"("firmId", "fyId", "slipNo");

-- CreateIndex
CREATE INDEX "SettlementSummary_tenantId_firmId_fyId_idx" ON "SettlementSummary"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementSummary_firmId_fyId_summaryNo_key" ON "SettlementSummary"("firmId", "fyId", "summaryNo");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_firmId_fyId_kind_idx" ON "Invoice"("tenantId", "firmId", "fyId", "kind");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_partyId_idx" ON "Invoice"("tenantId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_firmId_fyId_kind_invoiceNo_key" ON "Invoice"("firmId", "fyId", "kind", "invoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceLr_tenantId_lrId_idx" ON "InvoiceLr"("tenantId", "lrId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLr_invoiceId_lrId_key" ON "InvoiceLr"("invoiceId", "lrId");

-- CreateIndex
CREATE INDEX "InvoiceCharge_tenantId_idx" ON "InvoiceCharge"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_idx" ON "InvoiceLine"("tenantId");

-- CreateIndex
CREATE INDEX "BillSubmission_tenantId_firmId_fyId_idx" ON "BillSubmission"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_firmId_fyId_type_idx" ON "Voucher"("tenantId", "firmId", "fyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_firmId_fyId_type_voucherNo_key" ON "Voucher"("firmId", "fyId", "type", "voucherNo");

-- CreateIndex
CREATE INDEX "VoucherAllocation_tenantId_refType_refId_idx" ON "VoucherAllocation"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_firmId_fyId_partyId_date_idx" ON "LedgerEntry"("tenantId", "firmId", "fyId", "partyId", "date");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_refType_refId_idx" ON "LedgerEntry"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "Pod_tenantId_lrId_idx" ON "Pod"("tenantId", "lrId");

-- CreateIndex
CREATE UNIQUE INDEX "Pod_firmId_fyId_docNo_key" ON "Pod"("firmId", "fyId", "docNo");

-- CreateIndex
CREATE INDEX "BrokerSlip_tenantId_firmId_fyId_idx" ON "BrokerSlip"("tenantId", "firmId", "fyId");

-- CreateIndex
CREATE INDEX "BrokerSlip_tenantId_vehicleId_idx" ON "BrokerSlip"("tenantId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerSlip_firmId_fyId_slipNo_key" ON "BrokerSlip"("firmId", "fyId", "slipNo");

-- CreateIndex
CREATE INDEX "Trip_tenantId_vehicleId_tripDate_idx" ON "Trip"("tenantId", "vehicleId", "tripDate");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_firmId_fyId_tripNo_key" ON "Trip"("firmId", "fyId", "tripNo");

-- CreateIndex
CREATE INDEX "TripExpense_tenantId_idx" ON "TripExpense"("tenantId");

-- CreateIndex
CREATE INDEX "VehicleExpense_tenantId_vehicleId_date_idx" ON "VehicleExpense"("tenantId", "vehicleId", "date");

-- CreateIndex
CREATE INDEX "JobInfo_tenantId_vehicleId_idx" ON "JobInfo"("tenantId", "vehicleId");

-- CreateIndex
CREATE INDEX "JobEntry_tenantId_vehicleId_idx" ON "JobEntry"("tenantId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "JobEntry_firmId_fyId_invoiceNo_key" ON "JobEntry"("firmId", "fyId", "invoiceNo");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_idx" ON "Purchase"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_firmId_fyId_kind_invoiceNo_key" ON "Purchase"("firmId", "fyId", "kind", "invoiceNo");

-- CreateIndex
CREATE INDEX "TyreInstallation_tenantId_vehicleId_idx" ON "TyreInstallation"("tenantId", "vehicleId");

-- CreateIndex
CREATE INDEX "OpeningStock_tenantId_idx" ON "OpeningStock"("tenantId");

-- CreateIndex
CREATE INDEX "StationeryStock_tenantId_idx" ON "StationeryStock"("tenantId");

-- CreateIndex
CREATE INDEX "TrackingEvent_tenantId_lrId_idx" ON "TrackingEvent"("tenantId", "lrId");

-- CreateIndex
CREATE INDEX "SavedFilter_tenantId_idx" ON "SavedFilter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedFilter_userId_screen_name_key" ON "SavedFilter"("userId", "screen", "name");

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialYear" ADD CONSTRAINT "FinancialYear_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFirm" ADD CONSTRAINT "UserFirm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFirm" ADD CONSTRAINT "UserFirm_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_docTypeId_fkey" FOREIGN KEY ("docTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LrItem" ADD CONSTRAINT "LrItem_lrId_fkey" FOREIGN KEY ("lrId") REFERENCES "Lr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChalanLr" ADD CONSTRAINT "ChalanLr_chalanId_fkey" FOREIGN KEY ("chalanId") REFERENCES "Chalan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChalanLr" ADD CONSTRAINT "ChalanLr_lrId_fkey" FOREIGN KEY ("lrId") REFERENCES "Lr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChalanAdvance" ADD CONSTRAINT "ChalanAdvance_chalanId_fkey" FOREIGN KEY ("chalanId") REFERENCES "Chalan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLr" ADD CONSTRAINT "InvoiceLr_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLr" ADD CONSTRAINT "InvoiceLr_lrId_fkey" FOREIGN KEY ("lrId") REFERENCES "Lr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCharge" ADD CONSTRAINT "InvoiceCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSubmission" ADD CONSTRAINT "BillSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherAllocation" ADD CONSTRAINT "VoucherAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pod" ADD CONSTRAINT "Pod_lrId_fkey" FOREIGN KEY ("lrId") REFERENCES "Lr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_lrId_fkey" FOREIGN KEY ("lrId") REFERENCES "Lr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
