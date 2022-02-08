import { Request, Response, NextFunction } from "express";
import { Api } from "@core/types";
import { logStderr } from "@core/lib/utils/logger";

export const getErrorHandler = (res: Response) => (err: Api.ApiError) => {
    res.status(err.code ?? 500).send({
      type: "error",
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
    });
  },
  errorFallbackMiddleware = (
    err: Error | Api.ApiError,
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    logStderr("App Router Caught Unhandled Error!", { err });
    const apiError = err as Api.ApiError;
    apiError.code = 500;
    getErrorHandler(res)(apiError);
  };
