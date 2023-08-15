const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const exphbs = require("express-handlebars");
const path = require("path");
const stripJs = require("strip-js");
const shopData = require("./store-service.js");
const authData = require("./auth-service.js");
const clientSessions = require("client-sessions");
const {
  initialize,
  getAllItems,
  getCategories,
  addItem,
  getItemById,
  getPublishedItemsByCategory,
  getItemsByMinDate,
  addCategory,
  deleteCategoryById,
  deleteItemById,
} = require("./store-service.js");
const { resolve } = require("path");
const { redirect } = require("express/lib/response.js");

const app = express();

// Using the 'public' folder as our static folder
app.use(express.static("public"));

// Setup client-sessions
app.use(clientSessions({
  cookieName: "session", // this is the object name that will be added to 'req'
  secret: "web322shopapplication", // this should be a long un-guessable string.
  duration: 2 * 60 * 1000, // duration of the session in milliseconds (2 minutes)
  activeDuration: 1000 * 60 // the session will be extended by this many ms each request (1 minute)
}));

// Middleware to ensure that all of our templates have access to a "session" object
app.use(function (req, res, next) {
  res.locals.session = req.session;
  next();
});

// This is a helper middleware function that checks if a user is logged in
// we can use it in any route that we want to protect against unauthenticated access.
// A more advanced version of this would include checks for authorization as well after
// checking if the user is authenticated
function ensureLogin(req, res, next) {
  if (!req.session.user) {
    res.redirect("/login");
  } else {
    next();
  }
}

// This will add the property "activeRoute" to "app.locals" whenever the route changes
app.use(function (req, res, next) {
  let route = req.path.substring(1);
  app.locals.activeRoute =
    "/" +
    (isNaN(route.split("/")[1])
      ? route.replace(/\/(?!.*)/, "")
      : route.replace(/\/(.*)/, ""));
  app.locals.viewingCategory = req.query.category;
  next();
});

// Regular middleware
app.use(express.urlencoded({ extended: true }));

// Register handlebars as the rendering engine for views
app.engine(
  ".hbs",
  exphbs.engine({
    extname: ".hbs",
    // Handlebars custom helper to create active navigation links
    // Usage: {{#navLink "/about"}}About{{/navLink}}
    helpers: {
      navLink: function (url, options) {
        return (
          "<li" +
          (url == app.locals.activeRoute ? ' class="active" ' : "") +
          '><a href="' +
          url +
          '">' +
          options.fn(this) +
          "</a></li>"
        );
      },
      // Handlebars custom helper to check for equality
      // Usage: {{#equal value1 value2}}...{{/equal}}
      equal: function (lvalue, rvalue, options) {
        if (arguments.length < 3)
          throw new Error("Handlebars Helper equal needs 2 parameters");
        if (lvalue != rvalue) {
          return options.inverse(this);
        } else {
          return options.fn(this);
        }
      },
      safeHTML: function (context) {
        return stripJs(context);
      },
      formatDate: function (dateObj) {
        let year = dateObj.getFullYear();
        let month = (dateObj.getMonth() + 1).toString();
        let day = dateObj.getDate().toString();
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      },
    },
  })
);
app.set("view engine", ".hbs");

// Configuring Cloudinary
cloudinary.config({
  cloud_name: "dxpfxwdou",
  api_key: "965735778985461",
  api_secret: "c7VblouK_sGdtg6gFQel6h7Bxpw",
  secure: true,
});

// Variable without any disk storage
const upload = multer();

// Configuring the port
const HTTP_PORT = process.env.PORT || 8080;

// ========== Home Page Route ==========
app.get("/", (req, res) => {
  res.redirect("/shop");
});

// ========== About Page Route ==========
app.get("/about", (req, res) => {
  res.render("about");
});

// ========== Shop Page Route ==========
app.get("/shop", async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};
  try {
    // declare empty array to hold "item" objects
    let items = [];
    // if there's a "category" query, filter the returned items by category
    if (req.query.category) {
      // Obtain the published "items" by category
      items = await shopData.getPublishedItemsByCategory(req.query.category);
    } else {
      // Obtain the published "items"
      items = await shopData.getPublishedItems();
    }
    // sort the published items by postDate
    items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));
    // get the latest item from the front of the list (element 0)
    let item = items[0];
    // store the "items" and "item" data in the viewData object (to be passed to the view)
    viewData.items = items;
    viewData.item = item;
  } catch (err) {
    viewData.message = "no results";
  }
  try {
    // Obtain the full list of "categories"
    let categories = await shopData.getCategories();
    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }

  // render the "shop" view with all of the data (viewData)
  if (viewData.items.length > 0) {
    res.render("shop", { data: viewData });
  } else {
    res.render("shop", {
      data: viewData,
      message: "Please try another item / category",
    });
  }
});

// ========== Items Page Route ==========
app.get("/items", ensureLogin, (req, res) => {
  // Checking if a category was provided
  if (req.query.category) {
    getPublishedItemsByCategory(req.query.category)
      .then((data) => {
        data.length > 0
          ? res.render("items", { items: data })
          : res.render("items", { message: "No Results" });
      })
      // Error Handling
      .catch((err) => {
        res.render("items", { message: "no results" });
      });
  }

  // Checking if a minimum date is provided
  else if (req.query.minDate) {
    getItemsByMinDate(req.query.minDate)
      .then((data) => {
        data.length > 0
          ? res.render("items", { items: data })
          : res.render("items", { message: "No Results" });
      })
      // Error Handling
      .catch((err) => {
        res.render("items", { message: "no results" });
      });
  }

  // Checking whether no specification queries were provided
  else {
    getAllItems()
      .then((data) => {
        data.length > 0
          ? res.render("items", { items: data })
          : res.render("items", { message: "No Results" });
      })
      // Error Handling
      .catch((err) => {
        res.render("items", { message: "no results" });
      });
  }
});

// ========== Add Item Page Route (GET) ==========
app.get("/items/add", ensureLogin, (req, res) => {
  shopData.getCategories()
    .then((categories) => {
      res.render("addItem", { categories: categories });
    })
    .catch(() => {
      res.render("addItem", { categories: [] });
    });
});

// ========== Add Item Page Route (POST) ==========
app.post("/items/add", ensureLogin, upload.single("featureImage"), (req, res) => {
  // Configuring cloudinary image uploading
  let streamUpload = (req) => {
    return new Promise((resolve, reject) => {
      let stream = cloudinary.uploader.upload_stream((error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      });

      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });
  };

  async function upload(req) {
    let result = await streamUpload(req);
    return result;
  }

  // Once the upload is completed, we store the other form data in the object
  upload(req)
    .then((uploaded) => {
      req.body.featureImage = uploaded.url;
      let itemObject = {};

      // Add it Shop Item before redirecting to /items
      itemObject.body = req.body.body;
      itemObject.title = req.body.title;
      itemObject.postDate = new Date().toISOString().slice(0, 10);
      itemObject.category = req.body.category;
      itemObject.featureImage = req.body.featureImage;
      itemObject.published = req.body.published;

      // Adding the item if everything is okay
      // Only add the item if the entries make sense
      if (itemObject.title) {
        addItem(itemObject).then(() => {
          res.redirect("/items");
        });
      }
    })
    // Error Handling
    .catch((err) => {
      res.send(err);
    });
});

// ========== Find an item by ID Route ==========
app.get("/item/:value", (req, res) => {
  getItemById(req.params.value)
    .then((data) => {
      res.send(data);
    })
    // Error Handling
    .catch((err) => {
      res.send(err);
    });
});

// ========== Categories Page Route ==========
app.get("/categories", ensureLogin, (req, res) => {
  
  shopData.getCategories()
    .then((data) => {
      data.length > 0
        ? res.render("categories", { items: data })
        : res.render("categories", { message: "No Results" });
    })
    // Error Handling
    .catch(() => {
      res.render("categories", { message: "no results" });
    });
});

// ========== Add Categories Route ==========
app.get("/categories/add", ensureLogin, (req, res) => {
  res.render("addCategory");
});

// ========== Add Categories Post Route ==========
app.post("/categories/add", ensureLogin, (req, res) => {
  let catObject = {};
  // Add it Category before redirecting to /categories
  catObject.category = req.body.category;
  if (req.body.category != "") {
    addCategory(catObject)
      .then(() => {
        res.redirect("/categories");
      })
      .catch(() => {
        console.log("Some error occurred");
      });
  }
});

// ========== Delete Categories Route ==========
app.get("/categories/delete/:id", ensureLogin, (req, res) => {
  deleteCategoryById(req.params.id)
    .then(() => {
      res.redirect("/categories");
    })
    .catch(() => {
      console.log("Unable to remove category / Category not found");
    });
});

// ========== Delete Items Route ==========
app.get("/items/delete/:id", ensureLogin, (req, res) => {
  deleteItemById(req.params.id)
    .then(() => {
      res.redirect("/items");
    })
    .catch(() => {
      console.log("Unable to remove item / Item not found");
    });
});

// ========== Shop By ID Page Route ==========
app.get("/shop/:id", ensureLogin, async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};
  try {
    // declare empty array to hold "items" objects
    let items = [];
    // if there's a "category" query, filter the returned items by category
    if (req.query.category) {
      // Obtain the published "items" by category
      items = await shopData.getPublishedItemsByCategory(req.query.category);
    } else {
      // Obtain the published "items"
      items = await shopData.getPublishedItems();
    }
    // sort the published items by postDate
    items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));
    // store the "items" and "item" data in the viewData object (to be passed to the view)
    viewData.items = items;
  } catch (err) {
    viewData.message = "no results";
  }
  try {
    // Obtain the item by "id"
    viewData.item = await shopData.getItemById(req.params.id);
  } catch (err) {
    viewData.message = "no results";
  }
  try {
    // Obtain the full list of "categories"
    let categories = await shopData.getCategories();
    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }
  // render the "shop" view with all of the data (viewData)
  res.render("shop", { data: viewData });
});

// ========== Get Login Page Route ==========
app.get("/login", (req, res) => {
  res.render("login");
});

// ========== Get Register Page Route ==========
app.get("/register", (req, res) => {
  res.render("register");
});

// ========== Post Login Page Route ==========
app.post("/login", (req, res) => {
  req.body.userAgent = req.get('User-Agent');
  authData.checkUser(req.body)
    .then((user) => {
      req.session.user = {
        userName: user.userName,
        email: user.email,
        loginHistory: user.loginHistory
      };
      res.redirect('/items');
    })
    .catch((err) => {
      res.render('login', { errorMessage: err, userName: req.body.userName });
    });
});

// ========== Post Register Page Route ==========
app.post("/register", (req, res) => {
  authData.registerUser(req.body)
    .then(() => {
      res.render('register', { successMessage: 'User created' });
    })
    .catch((err) => {
      res.render('register', { errorMessage: err, userName: req.body.userName });
    });
});

// ========== Logout Route ==========
app.get("/logout", (req, res) => {
  req.session.reset();
  res.redirect("/");
});

// ========== User History Route ==========
app.get("/userHistory", ensureLogin, (req, res) => {
  res.render("userHistory");
});

// ========== HANDLE 404 REQUESTS ==========
app.use((req, res) => {
  res.status(404).render("404");
});

// ========== Setup http server to listen on HTTP_PORT ==========
shopData.initialize()
  .then(authData.initialize)
  .then(() => {
    app.listen(HTTP_PORT, function () {
      console.log("app listening on: " + HTTP_PORT)
    });
  }).catch((err) => {
    console.log("unable to start server: " + err);
  });
