/**
 * I wanted to finish the integration exercise to see what it would turn into,
 * and to demonstrate my thought process for this problem. I have implemented a
 * much more robust test runner, which can be run via `npm test <file>`, where
 * <file> represents a request/response capture file in JSON format (e.g.
 * requestlog-charges.json or requestlog-customer-charges.json).
 *
 * The test runner replays the captured requests in serial, parsing tokens
 * frome each response for use as dependencies in subsequent requests. From the
 * responses it extracts fresh charge, customer, and refund tokens, and stores
 * them in a map. The use of the map makes the capture file format quite
 * robust: no matter which tokens appear in the captured requests, the test
 * runner will correctly interpolate the freshly received tokens.
 *
 * Simple console output is provided to demonstrate that the system is working.
 */
const axios = require('axios');

class ResponseTokenMap {
  constructor() {
    this.tokenMappings = {};
  }

  interpolateTokens(string) {
    const tokenTypes = {
      charge: /ch_[A-Za-z1-9]+/,
      customer: /cus_[A-Za-z1-9]+/,
      refund: /re_[A-Za-z1-9]+/,
    };

    const interpolatedString = Object.keys(tokenTypes).reduce((stringForInterpolation, type) => {
      const tokenRegex = tokenTypes[type];
      const regexResult = stringForInterpolation.match(tokenRegex);
      const matchedToken = regexResult == null ? null : regexResult[0];

      if (typeof matchedToken !== 'string') {
        return stringForInterpolation;
      }

      if (this.tokenMappings[matchedToken] === undefined) {
        throw new Error(`Could not interpolate matching token for "${matchedToken}".`);
      }

      const replacedString = stringForInterpolation.replace(tokenRegex, this.tokenMappings[matchedToken]);

      return replacedString;
    }, string);

    return interpolatedString;
  }

  mapCapturedToResponseTokens(capturedResponse, response) {
    const capturedResponseBody = JSON.parse(capturedResponse.body);
    const responseBody = response.data;

    if (responseBody.id && capturedResponseBody.id) {
      this.tokenMappings[capturedResponseBody.id] = responseBody.id;
    }
  }
}

function runTests(tests, responseTokenMap) {
  const API_URL = 'https://api.stripe.com';

  let requestChain = Promise.resolve({});

  tests.forEach(test => {
    const capturedRequest = test.request;
    const capturedResponse = test.response;

    requestChain = requestChain
      .then(response => {
        return axios({
          data: responseTokenMap.interpolateTokens(capturedRequest.body),
          headers: capturedRequest.headers,
          method: capturedRequest.method,
          url: API_URL + responseTokenMap.interpolateTokens(capturedRequest.url),
        })
        .catch(error => {
          return error.response;
        })
        .then(response => {
          if (capturedResponse.code !== response.status) {
            throw new Error(`ERROR: Captured response status code does not match actual response status code for url: ${capturedRequest.url}. Captured: ${capturedResponse.code}. Actual: ${response.status}.`);
          }

          console.log(`SUCCESS: ${response.config.url}`);

          responseTokenMap.mapCapturedToResponseTokens(capturedResponse, response);
        })
      })
      .catch(error => {
        return Promise.reject(error);
      });
  });
}

const testFile = process.argv[3];

if (!testFile) {
  console.log('A test file must be specified as the first argument, e.g.: npm test requestlog-customer-charges.json');
  process.exit(1);
}

const tests = require('./' + testFile);

runTests(tests, new ResponseTokenMap());
