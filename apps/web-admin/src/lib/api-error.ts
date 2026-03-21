import { ApiRequestError } from '@noema/api-client';

export interface IRequestErrorDetails {
  title: string;
  description: string;
  hint?: string;
}

export function getRequestErrorDetails(
  error: unknown,
  resourceLabel: string,
  serviceLabel?: string
): IRequestErrorDetails {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: `You do not currently have access to ${resourceLabel}.`,
        description: 'Your session is missing the permissions this screen needs.',
        hint: 'Sign in again or switch to an account with the required admin scope.',
      };
    }

    if (error.status === 404) {
      return {
        title: `${resourceLabel} is not available yet.`,
        description: 'The admin app reached the backend, but that endpoint was not found.',
        hint: 'In local development, this usually means the route has not been exposed by the service.',
      };
    }

    if (error.status >= 500) {
      return {
        title: `${serviceLabel ?? resourceLabel} is unavailable right now.`,
        description:
          'The admin app made the request, but the upstream service failed before it could respond successfully.',
        hint: `If you are running locally, check whether ${serviceLabel ?? 'the backend service'} is started and healthy, then retry.`,
      };
    }
  }

  return {
    title: `We could not load ${resourceLabel}.`,
    description: 'The request did not complete successfully.',
    hint: 'Please retry in a moment. If the problem persists, check the local service logs.',
  };
}
