import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "../../../../lib/db";
export async function POST(req:Request) {
  try {
    const body=await req.json(); const name=String(body.name||"").trim(); const email=String(body.email||"").trim().toLowerCase(); const password=String(body.password||""); const role=String(body.role||"Staff");
    if(name.length<2||name.length>100||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128||!["Admin","Staff"].includes(role)) return NextResponse.json({error:"Enter a valid name, email, password (8–128 characters), and role."},{status:400});
    const hash=await bcrypt.hash(password,12);
    await pool.execute("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",[name,email,hash,role]);
    return NextResponse.json({message:"Account created."},{status:201});
  } catch(e:any) { if(e?.code==="ER_DUP_ENTRY") return NextResponse.json({error:"An account with this email already exists."},{status:409}); console.error(e); return NextResponse.json({error:"Registration failed. Check database setup."},{status:500}); }
}