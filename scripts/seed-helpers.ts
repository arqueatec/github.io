import bcrypt from "bcryptjs";
export const hashPasswordForSeed = (pw: string) => bcrypt.hash(pw, 10);
