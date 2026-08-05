/**
 * Indian states / UTs with their GST state codes — the first two digits of a
 * GSTIN. Seeded into the State master whenever it is empty (fresh install or
 * after a data wipe), so the software always starts with the standard list.
 * Codes 25 (merged into 26) and 28 (split into 36/37) are retired.
 */
export const INDIA_STATES: { name: string; gstCode: string }[] = [
  { name: "JAMMU & KASHMIR", gstCode: "01" },
  { name: "HIMACHAL PRADESH", gstCode: "02" },
  { name: "PUNJAB", gstCode: "03" },
  { name: "CHANDIGARH", gstCode: "04" },
  { name: "UTTARAKHAND", gstCode: "05" },
  { name: "HARYANA", gstCode: "06" },
  { name: "DELHI", gstCode: "07" },
  { name: "RAJASTHAN", gstCode: "08" },
  { name: "UTTAR PRADESH", gstCode: "09" },
  { name: "BIHAR", gstCode: "10" },
  { name: "SIKKIM", gstCode: "11" },
  { name: "ARUNACHAL PRADESH", gstCode: "12" },
  { name: "NAGALAND", gstCode: "13" },
  { name: "MANIPUR", gstCode: "14" },
  { name: "MIZORAM", gstCode: "15" },
  { name: "TRIPURA", gstCode: "16" },
  { name: "MEGHALAYA", gstCode: "17" },
  { name: "ASSAM", gstCode: "18" },
  { name: "WEST BENGAL", gstCode: "19" },
  { name: "JHARKHAND", gstCode: "20" },
  { name: "ODISHA", gstCode: "21" },
  { name: "CHHATTISGARH", gstCode: "22" },
  { name: "MADHYA PRADESH", gstCode: "23" },
  { name: "GUJARAT", gstCode: "24" },
  { name: "DADRA & NAGAR HAVELI AND DAMAN & DIU", gstCode: "26" },
  { name: "MAHARASHTRA", gstCode: "27" },
  { name: "KARNATAKA", gstCode: "29" },
  { name: "GOA", gstCode: "30" },
  { name: "LAKSHADWEEP", gstCode: "31" },
  { name: "KERALA", gstCode: "32" },
  { name: "TAMIL NADU", gstCode: "33" },
  { name: "PUDUCHERRY", gstCode: "34" },
  { name: "ANDAMAN & NICOBAR ISLANDS", gstCode: "35" },
  { name: "TELANGANA", gstCode: "36" },
  { name: "ANDHRA PRADESH", gstCode: "37" },
  { name: "LADAKH", gstCode: "38" },
];
