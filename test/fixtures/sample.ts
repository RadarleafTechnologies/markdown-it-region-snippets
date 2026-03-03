// TypeScript sample with region markers

export class Greeter {
  // #region sample_greet_function
  greet(name: string): string {
    return `Hello, ${name}!`
  }
  // #endregion

  // #region sample_async_greet
  async greetAsync(name: string): Promise<string> {
    return `Hello, ${name}!`
  }
  // #endregion
}
