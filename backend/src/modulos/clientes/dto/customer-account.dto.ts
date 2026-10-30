import {
  IsEnum,
  IsString,
  Length,
} from 'class-validator';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';

export class CreateCustomerAccountDto {
  @IsString()
  @Length(8, 8, {
    message: 'La contraseña de la cuenta de cliente debe tener exactamente 8 caracteres',
  })
  password: string;
}

export class UpdateCustomerAccountDto {
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
