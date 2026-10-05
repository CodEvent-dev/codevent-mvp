/**
 * Erreur applicative typee, portant un message utilisateur en francais
 * et un code HTTP. Permet au middleware d'erreur central d'afficher
 * un message explicite plutot qu'une trace technique.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
