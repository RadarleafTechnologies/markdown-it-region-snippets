import { Logger } from './logger'

// #region sample_interface
export interface User {
  id: string
  name: string
  email: string
}
// #endregion

// #region sample_class
export class UserService {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  // #region sample_method
  async getUser(id: string): Promise<User> {
    this.logger.info(`Fetching user ${id}`)
    return { id, name: 'Alice', email: 'alice@example.com' }
  }
  // #endregion
}
// #endregion
