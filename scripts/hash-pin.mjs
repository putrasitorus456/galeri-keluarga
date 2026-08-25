import bcrypt from "bcryptjs";

const pin = process.argv[2];

if (!pin) {
  console.error("Pemakaian: npm run hash-pin -- 1234");
  process.exit(1);
}

const hash = await bcrypt.hash(pin, 12);
const encoded = Buffer.from(hash, "utf8").toString("base64");
console.log(`APP_PIN_HASH=base64:${encoded}`);
