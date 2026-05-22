/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

/**
 * Represents a "pure" object from the wire that has its special properties with
 * $ prefix and is ready to be converted to an Coach object.
 *
 * This object intentionally does not have any generics attached to keep it simple
 * to use.
 *
 * @internal
 */
export interface SimpleOsdkProperties {
  $apiName: string;
  $objectType: string;
  $primaryKey: string | number;
  $title: string | undefined;
  $rid?: string;

  [key: string]:
    | string
    | Array<string>
    | number
    | Array<number>
    | boolean
    | Array<boolean>
    | undefined;
}
