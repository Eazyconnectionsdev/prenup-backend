// src/common/schemas/counter.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CounterDocument = Counter & Document;

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ required: true })
  _id!: string;

  @Prop({ default: 0 })
  seq!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
