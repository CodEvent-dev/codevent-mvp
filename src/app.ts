/**
 * Point d'entree Vercel. La plateforme charge ce fichier en premier
 * et n'accepte qu'une fonction (req, res) ou un serveur HTTP.
 * L'application Express est branchee derriere cette fonction.
 */
import type { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { boot } from "./expressApp";

const app = boot();

function handler(req: IncomingMessage, res: ServerResponse): void {
  app(req, res);
}

if (typeof express !== "function") {
  throw new Error("Express n'a pas pu etre charge.");
}

export = handler;
