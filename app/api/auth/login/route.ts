import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "../../../../lib/db";
import { makeToken,sessionCookie } from "../../../../lib/auth";
export async function POST(req:Request) {
 try {
  const {email,password}=await req.json();
  if(typeof email!=="string"||typeof password!=="string") return NextResponse.json({error:"Email and password are required."},{status:400});
  const [rows]:any=await pool.execute("SELECT id,name,email,password_hash,role FROM users WHERE email=? LIMIT 1",[email.trim().toLowerCase()]);
  if(!rows.length||!await bcrypt.compare(password,rows[0].password_hash)) return NextResponse.json({error:"Invalid email or password."},{status:401});
  const u=rows[0]; const response=NextResponse.json({user:{id:u.id,name:u.name,role:u.role}});
  response.cookies.set(sessionCookie,makeToken({id:u.id,name:u.name,role:u.role}),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*12});
  return response;
 } catch(e:any){console.error(e);return NextResponse.json({error:"Login failed. Check database setup and SESSION_SECRET."},{status:500});}
}