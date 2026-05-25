/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
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
