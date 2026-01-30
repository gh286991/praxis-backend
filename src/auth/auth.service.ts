import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateOAuthLogin(profile: any): Promise<User> {
    const { id, emails, displayName, photos } = profile;
    const email = emails[0].value;
    const picture = photos[0].value;

    let user = await this.usersService.findByGoogleId(id);

    if (!user) {
      user = await this.usersService.create({
        email,
        name: displayName,
        picture,
        googleId: id,
      });
      // Create user profile when creating a new user
      await this.usersService.findOrCreateProfile(user._id.toString());
    }

    return user;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user._id };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async loginDev(body: any) {
    if (body?.email === 'dev@example.com' && body?.password === '123456') {
      let user = await this.usersService.findByEmail('dev@example.com');
      if (!user) {
        user = await this.usersService.create({
          email: 'dev@example.com',
          name: 'Developer Test',
          picture: 'https://github.com/shadcn.png', // Placeholder
          googleId: 'dev_test_user',
        });
        // Create user profile when creating a new user
        await this.usersService.findOrCreateProfile(user._id.toString());
      }
      return this.login(user);
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async validateApiKey(apiKey: string): Promise<any> {
    // Simple verification for MCP integration
    // In production, you might look up a user by API key from DB
    const validKey = process.env.MCP_API_KEY;
    if (validKey && apiKey === validKey) {
        // Return a dummy user or find a specific admin user
        return { _id: 'mcp-system-user', email: 'mcp@system.local' };
    }
    return null;
  }
}
