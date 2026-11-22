import { describe, expect, it } from "vitest";
import { requestErrorMessage } from "./requestError";

describe("voice connection errors", () => {
  it("shows the server explanation instead of the HTTP request URL", async () => {
    const error = Object.assign(new Error("Request failed with status code 502"), {
      response: Response.json({ error: "The selected avatar isn't available." }, { status: 502 }),
    });
    expect(await requestErrorMessage(error, "Couldn't connect")).toBe("The selected avatar isn't available.");
  });

  it("uses a readable fallback when a gateway returns HTML", async () => {
    expect(await requestErrorMessage({ response: new Response("<h1>Bad gateway</h1>") }, "Couldn't connect")).toBe("Couldn't connect");
  });
});
