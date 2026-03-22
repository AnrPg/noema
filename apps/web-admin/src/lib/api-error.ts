import { ApiRequestError } from '@noema/api-client';

export interface IRequestErrorDetails {
  title: string;
  description: string;
  hint?: string;
}

function getLocalDevelopmentHint(serviceLabel?: string): string {
  return `If you are running locally, make sure ${serviceLabel ?? 'the related service'} is available, then try again.`;
}

export function getRequestErrorDetails(
  error: unknown,
  resourceLabel: string,
  serviceLabel?: string
): IRequestErrorDetails {
  if (error instanceof ApiRequestError) {
    if (error.status === 0 || error.code === 'NETWORK_ERROR') {
      return {
        title: `We could not reach Noema to load ${resourceLabel}.`,
        description: 'Your connection may be offline, or the service may be temporarily unreachable.',
        hint:
          process.env.NODE_ENV === 'development'
            ? getLocalDevelopmentHint(serviceLabel)
            : 'Check your connection and try again.',
      };
    }

    if (error.status === 408 || error.code === 'TIMEOUT') {
      return {
        title: `Loading ${resourceLabel} took too long.`,
        description: 'The request timed out before the page could finish loading.',
        hint: 'Please try again in a moment.',
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        title: `You do not have access to ${resourceLabel}.`,
        description: 'Your account does not have permission to view this page.',
        hint: 'Sign in again or use an account with the required access.',
      };
    }

    if (error.status === 404) {
      return {
        title: `We could not find ${resourceLabel}.`,
        description: 'This page or data is not available right now.',
        hint:
          process.env.NODE_ENV === 'development'
            ? `If you are running locally, the route for ${serviceLabel ?? resourceLabel} may not be available yet.`
            : 'Check the link or try again later.',
      };
    }

    if (error.status === 409) {
      return {
        title: `${resourceLabel} changed before it finished loading.`,
        description: 'The data was updated at the same time this page tried to read it.',
        hint: 'Refresh the page and try again.',
      };
    }

    if (error.status === 429) {
      return {
        title: `You are trying to load ${resourceLabel} too quickly.`,
        description: 'Please wait a moment before trying again.',
        hint: 'Retry in a few seconds.',
      };
    }

    if (error.status === 400 || error.status === 422) {
      return {
        title: `We could not load ${resourceLabel}.`,
        description: 'The request was rejected because some information was missing or invalid.',
        hint:
          error.fieldErrors !== undefined
            ? 'Review the entered information and try again.'
            : 'Refresh the page and try again.',
      };
    }

    if (error.status >= 500) {
      return {
        title: `We could not load ${resourceLabel} right now.`,
        description: 'Something went wrong on our side.',
        hint:
          process.env.NODE_ENV === 'development'
            ? getLocalDevelopmentHint(serviceLabel)
            : 'Please try again in a moment.',
      };
    }
  }

  return {
    title: `We could not load ${resourceLabel}.`,
    description: 'Something unexpected interrupted the request.',
    hint:
      process.env.NODE_ENV === 'development'
        ? getLocalDevelopmentHint(serviceLabel)
        : 'Please try again in a moment.',
  };
}
