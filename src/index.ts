export type OnePromiseOptions = {
  onChangeIsPending?: (isPending: boolean) => void;
};

export type OnePromiseNextGetter<T> = (
  context: OnePromiseNextContext,
) => T | PromiseLike<T>;

export type OnePromiseNextContext = {
  get signal(): AbortSignal;
};

export interface OnePromiseNext {
  <T>(
    value: PromiseLike<T> | OnePromiseNextGetter<T> | Exclude<T, Function>,
    onFulfilled?: null,
    onRejected?: null,
  ): Promise<Awaited<T>>;
  <T, F>(
    value: PromiseLike<T> | OnePromiseNextGetter<T> | Exclude<T, Function>,
    onFulfilled: (value: T, isCurrent: boolean) => F,
    onRejected?: null,
  ): Promise<Awaited<F>>;
  <T, R>(
    value: PromiseLike<T> | OnePromiseNextGetter<T> | Exclude<T, Function>,
    onFulfilled: null | undefined,
    onRejected: (reason: unknown, isCurrent: boolean) => R,
  ): Promise<Awaited<T | R>>;
  <T, F, R>(
    value: PromiseLike<T> | OnePromiseNextGetter<T> | Exclude<T, Function>,
    onFulfilled: (value: T, isCurrent: boolean) => F,
    onRejected: (reason: unknown, isCurrent: boolean) => R,
  ): Promise<Awaited<F | R>>;
}

/**
 * Creates a context for tracking the most recently created promise.
 *
 * @remarks
 *
 * ## The "next" function
 *
 * `onePromise` returns a function (called the "next" function) which is used to
 * set or replace the current Promise. The first argument of the "next" function
 * can either be a Promise object or a function that returns a Promise. (hint:
 * `async` functions always return a Promise)
 *
 * After the promise argument, the "next" function accepts two more optional
 * arguments, `onFulfilled` and `onRejected`. These callbacks are nearly
 * identical to the arguments of `Promise.then` but with one important
 * difference: each callback accepts a second boolean argument (`isCurrent`)
 * which indicates whether the promise is still current after it resolves. That
 * is, if the "next" function is called again while the promise from the initial
 * call is pending, then `isCurrent` will be `false`.
 *
 * The "next" function returns a new Promise with the result of the callback
 * functions (again, just like `Promise.then`). Or, if no callbacks are
 * provided, the returned Promise will resolve with the same value as the given
 * promise.
 *
 * ## "pending" state
 *
 * An instance of `onePromise()` is considered "pending" when the most recently
 * provided promise (the "current" promise) is pending. A function
 * `onChangeIsPending` may be provided in an object passed to `onePromise` which
 * will be invoked with a boolean value any time the "pending" status changes.
 *
 * ## Automatic `AbortSignal` and `fetch`
 *
 * The "next" function can provide an `AbortSignal` which will automatically be
 * aborted if the promise is replaced by a newer promise. This is commonly used
 * to abort a `fetch` call. The signal uses `OnePromiseAbortError` as the abort
 * "reason", so this error will be thrown if a `fetch` call is interrupted. See
 * the example below.
 *
 * Behind the scenes, the `AbortSignal` is not created unless it is requested.
 *
 * @example
 *
 * ```javascript
 * let currentDetails;
 * let isDetailsLoading = false;
 *
 * const nextDetails = onePromise({
 *   onChangeIsPending(isPending) {
 *     isDetailsLoading = isPending;
 *   },
 * });
 *
 * async function loadDetails(id) {
 *   const updated = await nextDetails(
 *     fetchDetails(id),
 *     (details, isCurrent) => {
 *       if (isCurrent) {
 *         currentDetails = details;
 *         return true;
 *       } else {
 *         return false;
 *       }
 *     },
 *   );
 *   return updated;
 * };
 * ```
 *
 * @example
 *
 * Another example using `AbortSignal`:
 *
 * ```javascript
 * const nextExample = onePromise();
 *
 * nextExample(
 *   async ({ signal }) => {
 *     // pass the signal to fetch
 *     const response = await fetch(`https://example.com/`, { signal });
 *     // the response body may also be aborted
 *     return await response.json();
 *   },
 *   (value, isCurrent) => {
 *     if (isCurrent) {
 *       console.log("Here's the latest", value);
 *     }
 *   },
 *   (err, _isCurrent) => {
 *     if (err instanceof OnePromiseAbortError) {
 *       // signal aborted
 *     } else {
 *       console.error("Something went wrong :(", err);
 *     }
 *   },
 * );
 * ```
 *
 * @param options - Optional options
 * @param options.onChangeIsPending - Function to be called with a boolean
 *   whenever the "is pending" state changes.
 * @returns A "next" function used to provide the next current promise and
 *   register callbacks including a "isCurrent" argument.
 */
export function onePromise({
  onChangeIsPending,
}: OnePromiseOptions = {}): OnePromiseNext {
  let current: PromiseRef | null = null;

  async function next<T, F = T, R = never>(
    valueArg: PromiseLike<T> | OnePromiseNextGetter<T> | Exclude<T, Function>,
    onFulfilled?: ((value: T, isCurrent: boolean) => F) | null,
    onRejected?: ((reason: unknown, isCurrent: boolean) => R) | null,
  ): Promise<Awaited<T | F | R>> {
    const thisRef: PromiseRef = { isCurrent: true, abortController: null };
    const promise =
      typeof valueArg === "function"
        ? (valueArg as OnePromiseNextGetter<T>)(nextContext(thisRef))
        : valueArg;
    const prev = current;
    current = thisRef;
    if (prev) {
      prev.isCurrent = false;
      prev.abortController?.abort(new OnePromiseAbortError());
    } else {
      queueMicrotask(() => onChangeIsPending?.(true));
    }
    let value;
    try {
      try {
        value = await promise;
      } finally {
        if (thisRef.isCurrent) {
          current = null;
          queueMicrotask(() => onChangeIsPending?.(false));
        }
      }
    } catch (err) {
      if (!onRejected) {
        throw err;
      }
      return await onRejected(err, thisRef.isCurrent);
    }
    if (!onFulfilled) {
      return value;
    }
    return await onFulfilled(value, thisRef.isCurrent);
  }

  return next;
}

export class OnePromiseAbortError extends Error {}

type PromiseRef = {
  isCurrent: boolean;
  abortController: AbortController | null;
};

function nextContext(ref: PromiseRef) {
  return {
    get signal() {
      if (!ref.abortController) {
        ref.abortController = new AbortController();
        if (!ref.isCurrent) {
          ref.abortController.abort(new OnePromiseAbortError());
        }
      }
      return ref.abortController.signal;
    },
  };
}
