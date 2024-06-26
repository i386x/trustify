pub mod advisory;
pub mod package;
pub mod sbom;
pub mod vulnerability;

//use crate::model::advisory::AdvisorySummary;
use crate::service::FetchService;
use actix_web::body::BoxBody;
use actix_web::http::StatusCode;
use actix_web::{web, HttpResponse, ResponseError};
use std::sync::Arc;
use trustify_common::db::Database;
use trustify_common::error::ErrorInformation;
use trustify_common::model::PaginatedResults;
use trustify_common::purl::PurlErr;
use trustify_entity::importer;
use utoipa::openapi::Schema;
use utoipa::{OpenApi, ToSchema};

pub fn configure(config: &mut web::ServiceConfig, db: Database) {
    let service = FetchService::new(db);
    config
        .app_data(web::Data::new(service))
        .service(
            web::scope("/api/v1/sbom")
                .service(sbom::all)
                .service(sbom::packages)
                .service(sbom::related),
        )
        .service(
            web::scope("/api/v1/advisory")
                .service(advisory::all)
                .service(advisory::get),
        )
        .service(
            web::scope("/api/v1/package")
                .service(package::dependencies)
                .service(package::variants),
        )
        .service(
            web::scope("/api/v1/vulnerability")
                .service(vulnerability::all)
                .service(vulnerability::get),
        );
}

#[derive(OpenApi)]
#[openapi(
    paths(
        sbom::all,
        sbom::packages,
        sbom::related,
        package::dependencies,
        package::variants,
        advisory::all,
        advisory::get,
        vulnerability::all,
        //vulnerability::advisories,
        //vulnerability::affected_packages,
        //vulnerability::affected_products,
        vulnerability::get,
    ),
    components(schemas(
        crate::model::advisory::AdvisoryDetails,
        crate::model::advisory::AdvisoryHead,
        crate::model::advisory::AdvisorySummary,
        crate::model::advisory::AdvisoryVulnerabilityHead,
        crate::model::advisory::AdvisoryVulnerabilitySummary,
        crate::model::advisory::PaginatedAdvisorySummary,
        crate::model::sbom::PaginatedSbomPackage,
        crate::model::sbom::PaginatedSbomPackageRelation,
        crate::model::sbom::PaginatedSbomSummary,
        crate::model::sbom::SbomPackage,
        crate::model::sbom::SbomPackageRelation,
        crate::model::sbom::SbomSummary,
        crate::model::vulnerability::PaginatedVulnerabilitySummary,
        crate::model::vulnerability::VulnerabilityAdvisoryHead,
        crate::model::vulnerability::VulnerabilityAdvisorySummary,
        crate::model::vulnerability::VulnerabilityDetails,
        crate::model::vulnerability::VulnerabilityHead,
        crate::model::vulnerability::VulnerabilitySummary,
        crate::service::sbom::Which,
        trustify_common::advisory::AdvisoryVulnerabilityAssertions,
        trustify_common::advisory::Assertion,
        trustify_common::purl::Purl,
        trustify_entity::relationship::Relationship,
    )),
    tags()
)]
pub struct ApiDoc;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Purl(#[from] PurlErr),
    #[error(transparent)]
    Actix(#[from] actix_web::Error),
    #[error("Invalid request {msg}")]
    BadRequest { msg: String, status: StatusCode },
    #[error(transparent)]
    Any(#[from] anyhow::Error),
}

impl ResponseError for Error {
    fn error_response(&self) -> HttpResponse<BoxBody> {
        match self {
            Self::Purl(err) => {
                HttpResponse::BadRequest().json(ErrorInformation::new("InvalidPurlSyntax", err))
            }
            Self::Actix(err) => {
                HttpResponse::InternalServerError().json(ErrorInformation::new("System Actix", err))
            }
            Self::BadRequest { msg, status } => {
                HttpResponse::build(*status).json(ErrorInformation::new("Bad request", msg))
            }
            Self::Any(err) => HttpResponse::InternalServerError()
                .json(ErrorInformation::new("System unknown", err)),
        }
    }
}
