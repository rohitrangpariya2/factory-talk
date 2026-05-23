import { Request, Response, NextFunction } from 'express';
import { auth } from '../../config/firebase';
import { getUserById } from '../../services/userService';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const user = await getUserById(decodedToken.uid);
    
    req.user = {
      uid: decodedToken.uid,
      phoneNumber: decodedToken.phone_number,
      ...user
    };
    
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
