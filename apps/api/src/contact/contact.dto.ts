import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your name.' })
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(200)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsIn(['', 'web-design', 'local-seo'])
  service?: string;

  @IsString()
  @IsNotEmpty({ message: 'Please tell us how we can help.' })
  @MaxLength(4000)
  message: string;

  /** Honeypot field; real visitors never see or fill it. */
  @IsOptional()
  @IsString()
  company?: string;
}
