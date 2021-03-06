import { Schema, arrayOf, normalize } from 'normalizr';
import { camelizeKeys } from 'humps';
import fbsdk from '../lib/fbsdk';


// Fetches an API response and normalizes the result JSON according to schema.
// This makes every API response have the same shape, regardless of how nested it was.
function callFbog(endpoint, schema) {
  return fbsdk.fBfetch(endpoint)
      .then((response) => {
        const data = response.data;
        if (!response.ok) {
          return Promise.reject(data);
        }

        const camelizedJson = camelizeKeys(data);

        return Object.assign({}, normalize(camelizedJson, schema));
      });
}

// We use this Normalizr schemas to transform API responses from a nested form
// to a flat form where repos and users are placed in `entities`, and nested
// JSON objects are replaced with their IDs. This is very convenient for
// consumption by reducers, because we can easily build a normalized tree
// and keep it updated as we fetch more data.

// Read more about Normalizr: https://github.com/gaearon/normalizr

const pageSchema = new Schema('pages', {
  idAttribute: 'id',
});

const eventSchema = new Schema('events', {
  idAttribute: 'id',
});

pageSchema.define({
  events: eventSchema,
});

// Schemas for Github API responses.
export const Schemas = {
  EVENT: eventSchema,
  EVENT_ARRAY: arrayOf(eventSchema),
  PAGE: pageSchema,
  PAGE_ARRAY: arrayOf(pageSchema),
};

// Action key that carries API call info interpreted by this Redux middleware.
export const CALL_FBOG = Symbol('Call FBOG');

// A Redux middleware that interprets actions with CALL_FBOG info specified.
// Performs the call and promises when such actions are dispatched.
export default store => next => action => {

  const callAPI = action[CALL_FBOG];
  if (typeof callAPI === 'undefined') {
    return next(action);
  }

  let { endpoint } = callAPI;
  const { schema, types } = callAPI;

  if (typeof endpoint === 'function') {
    endpoint = endpoint(store.getState());
  }

  if (typeof endpoint !== 'string') {
    throw new Error('Specify a string endpoint URL.');
  }
  if (!schema) {
    throw new Error('Specify one of the exported Schemas.');
  }
  if (!Array.isArray(types) || types.length !== 3) {
    throw new Error('Expected an array of three action types.');
  }
  if (!types.every(type => typeof type === 'string')) {
    throw new Error('Expected action types to be strings.');
  }

  function actionWith(data) {
    const finalAction = Object.assign({}, action, data);
    delete finalAction[CALL_FBOG];
    return finalAction;
  }

  const [requestType, successType, failureType] = types;
  next(actionWith({
    type: requestType,
  }));

  return callFbog(endpoint, schema).then(
    (response) => next(actionWith({
      response,
      type: successType,
    })),
    (error) => next(actionWith({
      type: failureType,
      error: error.message || 'Something bad happened',
    }))
  );
};
