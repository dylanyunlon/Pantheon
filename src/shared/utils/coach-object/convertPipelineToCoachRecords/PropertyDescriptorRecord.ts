/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

/** Helper object to make sure property descriptors are declared correctly */
export type PropertyDescriptorRecord<X> = {
  [K in keyof X]: PropertyDescriptor & { get?: () => X[K]; value?: X[K] };
};
