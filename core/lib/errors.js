'use strict';
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const notFound = (what = 'Registro') => new AppError(404, `${what} não encontrado.`);
module.exports = { AppError, notFound };
