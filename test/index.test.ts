import { describe, expect, it, test, vi } from "vitest";
import { onePromise, OnePromiseAbortError, OnePromiseNext } from "../";

describe("next function", () => {
  describe("onFulfilled argument", () => {
    it("receives resolved value as first argument", async () => {
      const next = onePromise();
      const onFulfilled = vi.fn();

      await next(Promise.resolve("value"), onFulfilled);

      expect(onFulfilled).toHaveBeenCalledTimes(1);
      expect(onFulfilled.mock.lastCall[0]).toBe("value");
    });

    test("isCurrent is false even if next is called with the same value", async () => {
      const next = onePromise();
      const onFulfilled = vi.fn();
      const sameValue = "same value";

      await Promise.all([next(sameValue, onFulfilled), next(sameValue)]);

      expect(onFulfilled).toBeCalledWith(sameValue, false);
    });

    resultCallbackTests({
      nextWithCallback(next, onFulfilled): unknown {
        return next(null, onFulfilled);
      },
    });
  });

  describe("onRejected argument", () => {
    it("receives reject reason as first argument", async () => {
      const next = onePromise();
      const onRejected = vi.fn();

      await next(Promise.reject("reason"), null, onRejected);

      expect(onRejected).toHaveBeenCalledTimes(1);
      expect(onRejected.mock.lastCall[0]).toBe("reason");
    });

    test("does not receive error thrown from onFulfilled", async () => {
      const next = onePromise();
      const onRejected = vi.fn();

      const out = next(
        null,
        () => {
          throw "things";
        },
        onRejected,
      );

      await expect(out).rejects.toBe("things");
      expect(onRejected).not.toHaveBeenCalled();
    });

    resultCallbackTests({
      nextWithCallback(next, onRejected): unknown {
        return next(Promise.reject(null), null, onRejected);
      },
    });
  });

  describe("when onFulfilled and onRejected are omitted", () => {
    describe("when called with a non-Promise value", () => {
      it("returns a Promise that resolves with the same value", async () => {
        const next = onePromise();
        await expect(next("value")).resolves.toBe("value");
      });
    });

    describe("when called with a Promise that resolves", () => {
      it("returns a Promise that resolves with the same value", async () => {
        const next = onePromise();
        await expect(next(Promise.resolve("value"))).resolves.toBe("value");
      });
    });

    describe("when called with a Promise that rejects", () => {
      it("returns a Promise that rejects with the same reason", async () => {
        const next = onePromise();
        await expect(next(Promise.reject("reason"))).rejects.toBe("reason");
      });
    });

    describe("when called with a function that returns a non-Promise value", () => {
      it("returns a Promise that resolves with the same value", async () => {
        const next = onePromise();
        await expect(next(() => "value")).resolves.toBe("value");
      });
    });

    describe("when called with a function that throws an error", () => {
      it("returns a Promise that rejects with the error", async () => {
        const next = onePromise();
        await expect(
          next(() => {
            throw "reason";
          }),
        ).rejects.toBe("reason");
      });
    });

    describe("when called with a function that returns a Promise that resolves", () => {
      it("returns a Promise that resolves with the same value", async () => {
        const next = onePromise();
        await expect(next(() => Promise.resolve("value"))).resolves.toBe(
          "value",
        );
      });
    });

    describe("when called with a function that returns a Promise that rejects", () => {
      it("returns a Promise that rejects with the same reason", async () => {
        const next = onePromise();
        await expect(next(() => Promise.reject("reason"))).rejects.toBe(
          "reason",
        );
      });
    });
  });

  describe("promise callback", () => {
    describe("context argument", () => {
      describe("when signal is requested", () => {
        it("returns an AbortSignal", async () => {
          const next = onePromise();
          const signal = await next(({ signal }) => signal);
          expect(signal).toBeInstanceOf(AbortSignal);
        });

        it("returns the same AbortSignal with multiple calls", async () => {
          const next = onePromise();
          const [a, b] = await next((cx) => [cx.signal, cx.signal]);
          expect(a).toBe(b);
        });

        it("aborts with OnePromiseAbortError when a second promise is provided", () => {
          let signal1: AbortSignal;
          const fakePromise1 = fakePromise();
          const next = onePromise();

          next(({ signal }) => {
            signal1 = signal;
            return fakePromise1.promise;
          });

          expect(signal1!.aborted).toBe(false);

          next(Promise.resolve());

          expect(() => signal1.throwIfAborted()).toThrowError(
            OnePromiseAbortError,
          );
        });

        it("is pre-aborted if the promise is not current", async () => {
          const fakePromise1 = fakePromise();
          const next = onePromise();

          const out1 = next(async (cx) => {
            await fakePromise1.promise;
            return cx.signal;
          });

          // expect(signal1!.aborted).toBe(false);

          next(Promise.resolve());
          fakePromise1.resolve();
          const signal = await out1;

          expect(() => signal.throwIfAborted()).toThrowError(
            OnePromiseAbortError,
          );
        });
      });

      describe("when signal is not requested", () => {
        it("does not create AbortController", async () => {
          const abortController = vi.fn();
          vi.stubGlobal("AbortController", abortController);
          const next = onePromise();
          await next((_cx) => {});
          expect(abortController).not.toHaveBeenCalled();
        });
      });
    });
  });

  function resultCallbackTests({
    nextWithCallback,
  }: {
    nextWithCallback(next: OnePromiseNext, callback: () => unknown): unknown;
  }) {
    test("isCurrent argument is true if next was not called again", async () => {
      const next = onePromise();
      const onFulfilled = vi.fn();

      await nextWithCallback(next, onFulfilled);

      expect(onFulfilled).toHaveBeenCalledTimes(1);
      expect(onFulfilled.mock.lastCall[1]).toBe(true);
    });

    test("isCurrent argument is false if next was called again", async () => {
      const next = onePromise();
      const onFulfilled = vi.fn();

      nextWithCallback(next, onFulfilled);
      await nextWithCallback(next, onFulfilled);

      expect(onFulfilled).toHaveBeenCalledTimes(2);
      expect(onFulfilled.mock.calls).toEqual([
        [null, false],
        [null, true],
      ]);
    });

    describe("when a non-Promise value is returned", () => {
      test("next resolves with the return value", async () => {
        const next = onePromise();

        const out = nextWithCallback(next, () => "value");

        await expect(out).resolves.toBe("value");
      });
    });

    describe("when an error is thrown", () => {
      test("next rejects with the thrown reason", async () => {
        const next = onePromise();

        const out = nextWithCallback(next, () => {
          throw "reason";
        });

        await expect(out).rejects.toBe("reason");
      });
    });

    describe("when a resolved Promise is returned", () => {
      test("next resolves with the return value", async () => {
        const next = onePromise();

        const out = nextWithCallback(next, () => Promise.resolve("value"));

        await expect(out).resolves.toBe("value");
      });
    });

    describe("when a rejected Promise is returned", () => {
      test("next rejects with the thrown reason", async () => {
        const next = onePromise();

        const out = nextWithCallback(next, () => Promise.reject("reason"));

        await expect(out).rejects.toBe("reason");
      });
    });
  }
});

describe("onChangeIsPending", () => {
  test("is not required", () => {
    const next = onePromise();
    expect(next("value")).resolves.toBe("value");
  });

  test("is not called on initialization", async () => {
    const onChangeIsPending = vi.fn();

    onePromise({ onChangeIsPending });

    await new Promise((resolve) => setTimeout(resolve));
    expect(onChangeIsPending).not.toBeCalled();
  });

  test("called with true when next is called", async () => {
    const onChangeIsPending = vi.fn();

    const next = onePromise({ onChangeIsPending });

    next(fakePromise().promise);

    await Promise.resolve();
    expect(onChangeIsPending).toBeCalledTimes(1);
    expect(onChangeIsPending).toBeCalledWith(true);
  });

  test("called with false after Promise resolves", async () => {
    const onChangeIsPending = vi.fn();

    const next = onePromise({ onChangeIsPending });

    await next(Promise.resolve());

    expect(onChangeIsPending.mock.calls).toEqual([[true], [false]]);
  });

  test("called with false after Promise rejects", async () => {
    const onChangeIsPending = vi.fn();

    const next = onePromise({ onChangeIsPending });

    await next(Promise.reject("reason")).catch(() => {});

    expect(onChangeIsPending.mock.calls).toEqual([[true], [false]]);
  });

  test("called with true again for a second promise", async () => {
    const isPendingValues: boolean[] = [];
    const next = onePromise({
      onChangeIsPending(isPending) {
        isPendingValues.push(isPending);
      },
    });

    await next(null);
    await next(null);

    expect(isPendingValues).toEqual([true, false, true, false]);
  });

  test("errors do not propagate through next or onRejected", async () => {
    vi.useFakeTimers({ toFake: ["queueMicrotask"] });
    try {
      const onRejected = vi.fn();
      const next = onePromise({
        onChangeIsPending() {
          throw "reason";
        },
      });

      const out = next("value", null, onRejected);

      await expect(out).resolves.toBe("value");
      expect(onRejected).not.toHaveBeenCalled();
      expect(() => vi.runAllTicks()).throws("reason");
    } finally {
      vi.useRealTimers();
    }
  });

  test("is not invoked with redundant calls when there are multiple pending notifications", async () => {
    const values: boolean[] = [];
    const next = onePromise({
      onChangeIsPending(isPending) {
        values.push(isPending);
      },
    });
    const fakePromise1 = fakePromise();

    next(fakePromise1.promise);
    await next(() => {
      fakePromise1.resolve();
    });

    expect(values).toEqual([true, false]);
  });

  test("is not invoked with false when a non-current promise resolves", async () => {
    const values: boolean[] = [];
    const next = onePromise({
      onChangeIsPending(isPending) {
        values.push(isPending);
      },
    });
    const fakePromise1 = fakePromise();
    const fakePromise2 = fakePromise();

    const out = next(fakePromise1.promise);
    next(fakePromise2.promise);
    await Promise.resolve();
    fakePromise1.resolve();
    await out;

    expect(values).toEqual([true]);
  });
});

function fakePromise(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve;
  const promise = new Promise<void>((a) => {
    resolve = a;
  });
  return {
    promise,
    resolve: resolve!,
  };
}
