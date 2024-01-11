# OnePromise

_A tiny JavaScript utility for tracking the most recently created promise._

OnePromise is useful when you have an asynchronous task,
that task could have multiple pending executions at the same time,
but only the most recent execution of that task is significant.
In other words, only _one promise_ is the _current_ promise,
and any older promises should be ignored or handled differently when they complete.

## Goals

* Easily detect when a Promise is interrupted by a newer Promise
* Simplify your `isLoading` state
* Automatically abort `fetch` requests
* Minimal interface that mimics [`Promise.then`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then)
* Zero dependencies
* Written in TypeScript
* Tiny (less than 1 KB)

## Installation

With npm:

```
npm install --save one-promise
```

## Examples

OnePromise is probably best explained by just showing an example. So here is a typical usage example:

```javascript
let currentDetails;
let isDetailsLoading = false;

// call onePromise once at setup time
// use the returned value as a "next promise" function
const nextDetails = onePromise({
  // optionally provide a callback to watch "is pending" status
  onChangeIsPending(isPending) {
    isDetailsLoading = isPending;
  },
});

async function loadDetails(id) {
  // call the "next" function returned from onePromise()
  const updated = await nextDetails(
    // fetchDetails returns a Promise
    fetchDetails(id),
    // `onFulfilled` callback similar to `Promise.then` but with an `isCurrent` argument
    (details, isCurrent) => {
      if (isCurrent) {
        // Yay! This is still the most recent call to `loadDetails`.
        currentDetails = details;
        return true;
      } else {
        // Shucks. `loadDetails` was called again so this value is outdated
        return false;
      }
    },
  );
  return updated;
}
```

Here is another example, this time using an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) and [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API):

```javascript
const nextExample = onePromise();

nextExample(
  // An async function may be used instead of a Promise.
  // The callback requires `signal` which will be an `AbortSignal`.
  // The signal will automatically abort if interrupted by another call.
  async ({ signal }) => {
    // pass the signal to fetch
    const response = await fetch(`https://example.com/`, { signal });
    // the response body may also be aborted
    return await response.json();
  },
  (value, isCurrent) => {
    if (isCurrent) {
      console.log("Here's the latest", value);
    }
  },
  (err, _isCurrent) => {
    if (err instanceof OnePromiseAbortError) {
      // signal aborted
    } else {
      console.error("Something went wrong :(", err);
    }
  },
);
```

## Why?

I wrote this library because I felt like I had to re-solve the same problem in every application that I work on,
oftentimes more than once in the same application.
The problem I'm talking about typically sounds like this:

_I have a UI component that fetches data and displays it.
It has a "loading" state and an "error" state for when the fetch fails.
The specific data to be fetched may change based on inputs,
and those inputs may change at any time._

These requirements raise a lot of corner cases where it is easy to introduce subtle bugs.
Many libraries and frameworks provide some way of helping to implement this scenario,
but I wanted something that is highly generalized, lightweight,
and not specific to any framework.

### What about [RxJS](https://rxjs.dev/)?

Some will point to RxJS as the preferred solution for this.
RxJS is awesome and you certainly can use RxJS to achieve these goals
(particularly with the `switchMap` operator).
But sometimes RxJS feels like buying a laptop when you just need a calculator.
`Promise` is a simpler abstraction than `Observable`.
OnePromise is an attempt to find an elegant solution to a specific problem while staying in the realm of promises,
which are native to JavaScript.
