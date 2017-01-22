// Copyright 2015-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const express = require('express');
const config = require('../config');
const images = require('../lib/images');
const oauth2 = require('../lib/oauth2');
var multer = require('multer');
const storage = require('@google-cloud/storage');
var Quiche = require('quiche');


// Set up auth
var gcloud = require('gcloud')({
  keyFilename: 'Closet-c45e6ee5c6ce.json',
  projectId: 'closet-156315'
  // keyFilename: 'PixelWear-e4ca09b61f31.json',
  // projectId: 'pixelwear-156317'
});

// var storage = gcloud.storage();

var gcs = storage({
  keyFilename: 'Closet-c45e6ee5c6ce.json',
  projectId: 'closet-156315'
});

var vision = gcloud.vision();


function getModel () {
  return require(`./model-${config.get('DATA_BACKEND')}`);
}

const router = express.Router();

// Use the oauth middleware to automatically get the user's profile
// information and expose login/logout URLs to templates.
router.use(oauth2.template);

// Set Content-Type for all responses for these routes
router.use((req, res, next) => {
  res.set('Content-Type', 'text/html');
  next();
});

/**
 * GET login
 *
 * If the user is not logged in then go to login.jade
 */
router.get('/', (req, res, next) => {
  console.log(req.user);
    if(req.user){

      res.redirect('/books/mine');
    }else{
      res.redirect('/books/login');

  }
});

router.get('/login', (req, res, next)=> {
  if(req.user){
    res.redirect('/books/mine');
  }else{
    res.render('login.jade');
  }
});

//test
router.get('/stats', (req, res, next) => {
  var pie = new Quiche('pie');
  pie.setTransparentBackground(); // Make background transparent
  pie.addData(3000, 'Jacket', 'FF0000');
  pie.addData(2900, 'Pants', '0000FF');
  pie.addData(1500, 'T-shirt', '00FF00');
  pie.setLabel(['Jacket','Pants','T-shirt']); // Add labels to pie segments
  var image = pie.getUrl(true); // First param controls http vs. https
  console.log(image);
  res.render('books/stats.jade', {chart: image});
});

/**
 * GET /books/add
 *
 * Display a page of books (up to ten at a time).
 */

// Use the oauth2.required middleware to ensure that only logged-in users
// can access this handler.
router.get('/mine', oauth2.required, (req, res, next) => {
  getModel().listBy(
    req.user.id,
    10,
    req.query.pageToken,
    (err, entities, cursor, apiResponse) => {
      if (err) {
        next(err);
        return;
      }
      res.render('books/list.jade', {
        books: entities,
        nextPageToken: cursor
      });
    }
  );
});

/**
 * GET /books/add
 *
 * Display a form for creating a book.
 */
router.get('/add', (req, res) => {
  res.render('books/form.jade', {
    book: {},
    action: 'Add'
  });
});

/**
 * POST /books/add
 *
 * Create a book.
 */
// [START add]
router.post(
  '/add',
   images.multer.single('image'),
   images.sendUploadToGCS,
  (req, res, next) => {
    // Choose what the Vision API should detect
    // Choices are: faces, landmarks, labels, logos, properties, safeSearch, texts
     var types = ['labels', 'properties'];
    const bucket = gcs.bucket('CLOUD_BUCKET');
    //const file = bucket.file(req.file.name);
    const data = req.body;

    // // If the user is logged in, set them as the creator of the book.
     if (req.user) {
      data.createdBy = req.user.displayName;
      data.createdById = req.user.id;
    } else {
      data.createdBy = 'Anonymous';
    }

    // Was an image uploaded? If so, we'll use its public URL
    // in cloud storage.
    if (req.file && req.file.cloudStoragePublicUrl) {
      data.imageUrl = req.file.cloudStoragePublicUrl;

      //detectLabelsGCS(bucket, 'image');

      // console.log(file);
      // vision.detect(file, types, function(err, detections, apiResponse) {
      //   if (err) {
      //     console.log(err);
      //     res.end('Cloud Vision Error');
      //   } else {
      //     // Write out the JSON output of the Vision API
      //     //console.log("I am here!");
      //     res.write(JSON.stringify(detections, null, 4));
      //     // console.log(JSON.stringify(detections, null, 4));
      //   }
      // });
    }

    //Save the data to the database.
    getModel().create(data, true, (err, savedData) => {
      if (err) {
        next(err);
        return;
      }
      res.redirect(`${req.baseUrl}/${savedData.id}`);
    });
  }
);
// [END add]

/**
 * GET /books/:id/edit
 *
 * Display a book for editing.
 */
router.get('/:book/edit', (req, res, next) => {
  getModel().read(req.params.book, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.render('books/form.jade', {
      book: entity,
      action: 'Edit'
    });
  });
});

/**
 * POST /books/:id/edit
 *
 * Update a book.
 */
router.post(
  '/:book/edit',
  images.multer.single('image'),
  images.sendUploadToGCS,
  (req, res, next) => {
    const data = req.body;

    // Was an image uploaded? If so, we'll use its public URL
    // in cloud storage.
    if (req.file && req.file.cloudStoragePublicUrl) {
      req.body.imageUrl = req.file.cloudStoragePublicUrl;
    }

    getModel().update(req.params.book, data, true, (err, savedData) => {
      if (err) {
        next(err);
        return;
      }
      res.redirect(`${req.baseUrl}/${savedData.id}`);
    });
  }
);

/**
 * GET /books/:id
 *
 * Display a book.
 */
router.get('/:book', (req, res, next) => {
  getModel().read(req.params.book, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.render('books/view.jade', {
      book: entity
    });
  });
});

/**
 * GET /books/:id/delete
 *
 * Delete a book.
 */
router.get('/:book/delete', (req, res, next) => {
  getModel().delete(req.params.book, (err) => {
    if (err) {
      next(err);
      return;
    }
    res.redirect(req.baseUrl);
  });
});

/**
 * Errors on "/books/*" routes.
 */
router.use((err, req, res, next) => {
  // Format error and forward to generic error handler for logging and
  // responding to the request
  err.response = err.message;
  next(err);
});

function detectLabelsGCS (bucketName, fileName) {
  // Instantiates clients


  // The bucket where the file resides, e.g. "my-bucket"
  const bucket = gcs.bucket(bucketName);
  // The image file to analyze, e.g. "image.jpg"
  const file = bucket.file(fileName);

  // Performs label detection on the remote file
  return vision.detectLabels(file)
    .then((results) => {
      const labels = results[0];

      console.log('Labels:');
      labels.forEach((label) => console.log(label));

      return labels;
    });
}

module.exports = router;
