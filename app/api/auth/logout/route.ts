import { NextResponse } from "next/server";
import { sessionCookie } from "../../../../lib/auth";
export async function POST(){const r=NextResponse.json({message:"Signed out"});r.cookies.set(sessionCookie,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});return r;}